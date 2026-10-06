"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { atlasSheetOf } from "@/lib/data/sprites";
import type { MapData } from "../data";
import { requestRender } from "../state/invalidate";
import { useMapStore } from "../state/mapStore";
import { viewBounds, type OrthoCameraLike, type ViewBounds } from "../state/projection";
import { ATLAS_LOAD_PX, zoomForCoverPx } from "../state/zoomLimits";

// ImageBitmapLoader decodes off the main thread (a worker + createImageBitmap),
// avoiding the 50-150ms main-thread decode hitch TextureLoader causes per
// atlas. imageOrientation "none" and premultiplyAlpha
// "none" keep the decode from applying any browser-default transforms our
// pipeline doesn't expect.
const loader = new THREE.ImageBitmapLoader();
loader.setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });

// Atlases load only once the camera is zoomed in far enough that covers are
// about to show: covers would be ATLAS_LOAD_PX (13) CSS px, just before the
// cross-fade starts at 16 px (state/zoomLimits.ts). At the overview nothing
// benefits from the download and decode of a sheet.

/** Sheets whose texture is uploaded, for overlays that mirror the shader (OverlayDriver). */
const loadedSheets = new Set<number>();
export const isAtlasSheetLoaded = (sheet: number): boolean => loadedSheets.has(sheet);

/**
 * A sheet goes to the GPU in this many horizontal bands, one per animation frame. Copying a whole 3072 px sheet
 * in one call holds the main thread for about 16 ms (M1 Pro, on top of the frame being drawn), which showed as a
 * 30 to 50 ms frame for every sheet while zooming in; a band of a quarter of it does not.
 */
export const UPLOAD_BANDS = 4;

/** The [firstRow, endRow) of each band of a sheet `height` px tall; together they cover every row once. */
export function uploadBands(height: number, bands = UPLOAD_BANDS): [number, number][] {
  const n = Math.max(1, Math.min(bands, height));
  return Array.from({ length: n }, (_, i) => [Math.floor((i * height) / n), Math.floor(((i + 1) * height) / n)]);
}

/** True once the camera is zoomed in far enough that covers are about to show, so sheets are worth loading. */
export function coversNear(zoom: number, canvasHeightCssPx: number): boolean {
  return zoom >= zoomForCoverPx(ATLAS_LOAD_PX, canvasHeightCssPx);
}

/**
 * An empty texture of the sheet's size, allocated on the GPU with every mipmap level and no pixels yet. Its
 * mipmaps are not built here (there is nothing to build them from): uploadAtlas builds them once, with the
 * last band.
 */
export function createAtlasTexture(renderer: THREE.WebGLRenderer, width: number, height: number): THREE.Texture {
  const tex = new THREE.DataTexture(null, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  // Storage only: the pixels arrive band by band (uploadAtlas).
  tex.source.dataReady = false;
  // Pipeline atlases are laid out with row 0 at the top (PIL pixel space),
  // and atlasSlot().v is the row's top edge as a fraction of the sheet, so
  // v=0 must map to the top row of the image (no flipY).
  tex.flipY = false;
  // Atlases are authored as sRGB images. Our shaders write sRGB-authored
  // values straight to the framebuffer (no linear<->sRGB roundtrip), so
  // sampling must also stay in sRGB space, NoColorSpace skips the
  // implicit sRGB->linear conversion three.js would otherwise apply.
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // three.js allocates storage for all mipmap levels in two cases: when generateMipmaps is on, and then it also
  // builds them at once (here from an empty level 0, a wasted pass over the whole sheet), or when the texture
  // lists its own mipmaps. Listing them without data (dataReady is false, so none is uploaded) gets the storage
  // and nothing else. The list is only read by this one upload, so it is cleared again.
  const levels = Math.floor(Math.log2(Math.max(width, height))) + 1;
  tex.mipmaps = Array.from({ length: levels }, (_, i) => ({ data: null, width: Math.max(1, width >> i), height: Math.max(1, height >> i) })) as unknown as THREE.Texture["mipmaps"];
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  renderer.initTexture(tex);
  tex.mipmaps = [];
  return tex;
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Copies a decoded sheet into a new texture, a band per animation frame, building the mipmaps with the last
 * band, and releases the decoded image: the texture is the only copy kept (a decoded 3072 px sheet is 38 MB,
 * its texture with mipmaps 50 MB). Resolves with null, having released everything, when the load is no longer
 * wanted on the way: `current` turned false (the data set changed, the map unmounted, or the WebGL context was
 * lost or restored: the hook below moves its epoch on in those events) or the context reports itself lost (the
 * event for a loss arrives later than the loss). The texture is allocated only after the first such check.
 */
export async function uploadAtlas(renderer: THREE.WebGLRenderer, bitmap: ImageBitmap, current: () => boolean): Promise<THREE.Texture | null> {
  const wanted = () => current() && !renderer.getContext().isContextLost();
  let tex: THREE.Texture | null = null;
  try {
    if (!wanted()) return null;
    const { width, height } = bitmap;
    tex = createAtlasTexture(renderer, width, height);
    // Never uploaded itself: only the source of the copies below.
    const source = new THREE.Texture(bitmap as unknown as HTMLImageElement);
    const bands = uploadBands(height);
    const region = new THREE.Box2();
    const at = new THREE.Vector2();
    for (let i = 0; i < bands.length; i++) {
      await nextFrame();
      if (!wanted()) {
        tex.dispose();
        return null;
      }
      const [y0, y1] = bands[i];
      // The mipmaps are built once, by the copy of the last band.
      if (i === bands.length - 1) tex.generateMipmaps = true;
      renderer.copyTextureToTexture(source, tex, region.set(at.set(0, y0), new THREE.Vector2(width, y1)), at.set(0, y0));
    }
    return tex;
  } catch (err) {
    tex?.dispose();
    throw err;
  } finally {
    bitmap.close();
  }
}

function loadBitmap(url: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    loader.load(url, (result) => resolve(result as unknown as ImageBitmap), undefined, (err) => reject(err));
  });
}

/** Atlas sheet of every album (sprites.ts atlasSheetOf). */
function buildAtlasIndexByPosition(data: MapData): Int16Array {
  const out = new Int16Array(data.n);
  for (let i = 0; i < data.n; i++) out[i] = atlasSheetOf(i);
  return out;
}

const view: ViewBounds = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Cheap O(n) pass over the current interpolated positions, counting into `counts` (one entry per sheet) how
 * many albums are inside the camera's view, i.e. on screen, per atlas sheet. It decides which not-yet-loaded
 * sheet to fetch next, and whether any is needed at all. It allocates nothing, since it runs while the camera
 * moves (at most once per RECHECK_MS). It reads the camera as it is now (viewBounds, the map's one mirror of
 * the projection), not its matrices: those are only brought up to date when a frame is drawn, and a look made
 * after a jump of the camera and before that frame would count the place the camera has left.
 */
export function countVisibleSpritesByAtlas(
  atlasIndexByPosition: Int16Array,
  positions: Float32Array,
  camera: OrthoCameraLike,
  counts: Int32Array,
): void {
  counts.fill(0);
  const n = atlasIndexByPosition.length;
  if (positions.length < n * 2) return;
  viewBounds(camera, view);
  const left = camera.position.x + view.left;
  const right = camera.position.x + view.right;
  const bottom = camera.position.y + view.bottom;
  const top = camera.position.y + view.top;
  const sheets = counts.length;
  for (let i = 0; i < n; i++) {
    const sheet = atlasIndexByPosition[i];
    if (sheet < 0 || sheet >= sheets) continue;
    const x = positions[i * 2];
    if (x < left || x > right) continue;
    const y = positions[i * 2 + 1];
    if (y < bottom || y > top) continue;
    counts[sheet]++;
  }
}

/**
 * While no sheet that is still to load has an album on screen, the queue looks again at most this often, and
 * only when the map has drawn a frame since (camera movement, the slider): each such frame makes sure one look
 * is due after it, so the last frame of a movement is always followed by one.
 */
export const RECHECK_MS = 120;

/** Where the queue is. Only LOADING has a request or an upload in flight. */
const PAUSED = 0; // zoomed out to where no covers show (also the start): the next frame that is zoomed in starts it
const LOADING = 1;
const WAITING = 2; // zoomed in, and no sheet that is still to load has an album on screen
const DONE = 3; // every sheet is loaded
const HALTED = 4; // the WebGL context is lost: nothing happens until it is restored

/**
 * Loads the atlas sheets that are needed, one at a time, once covers are about to show (ATLAS_LOAD_PX):
 * atlas-0 first when it has an album on screen, then always whichever not-yet-loaded sheet currently covers
 * the most on-screen albums (recomputed each time a sheet finishes, since the camera may have moved during the
 * load). A sheet with no album on screen is not loaded: a catalog of 10,467 albums has eleven sheets (about
 * 25 MB to fetch, 50 MB of texture each), and zoomed in to a few dozen covers only some of them are in view.
 * The queue then waits and looks again as the camera moves (RECHECK_MS, outside the frames). The sheet of the album picked in
 * Explore counts as needed wherever that album is, since the map draws it large and framed. Sheets that were
 * loaded stay loaded (nothing is evicted). The queue also waits while the camera is zoomed back out to where no
 * covers show, and goes on at the next zoom in, so a glance in and out does not fetch every sheet.
 *
 * A lost WebGL context stops the queue and discards the sheet in flight; a restored one has empty textures (the
 * decoded sheets are not kept), so every needed sheet is loaded again, from the browser's cache.
 *
 * Reads camera.zoom directly off the live THREE camera inside useFrame (no React state or prop feeds the zoom
 * in), and only ever flips the `textures` state array when a texture actually finishes loading or the context
 * is restored, not once per frame. The frame callback does no work while a sheet is loading or all are loaded.
 */
export function useAtlasTextures(
  data: MapData,
  positionsRef: React.RefObject<Float32Array>,
): (THREE.Texture | null)[] {
  const urls = data.atlasUrls;
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const gl = useThree((s) => s.gl);
  // Counts restored WebGL contexts: a restored context has empty textures (the decoded sheets are not kept), so
  // every sheet is loaded again, from the browser's cache.
  const [restores, setRestores] = useState(0);
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>(() =>
    urls.map(() => null),
  );
  // Reset the texture state during render when `urls` changes (the
  // "adjusting state when a prop changes" pattern), rather than inside the
  // effect below: a setState call synchronous with the render that needs it
  // avoids an extra commit versus calling it from an effect. The effect
  // below still owns the actual side effects (disposing the previous url
  // set's GPU textures/bitmaps), which can't move to render since it must
  // run exactly once per change, not once per render attempt.
  const [prevUrls, setPrevUrls] = useState(urls);
  if (prevUrls !== urls) {
    setPrevUrls(urls);
    setTextures(urls.map(() => null));
  }
  const atlasIndexByPosition = useMemo(() => buildAtlasIndexByPosition(data), [data]);
  // On-screen albums per sheet, refilled by every look (never reallocated while the data set stays).
  const counts = useMemo(() => new Int32Array(urls.length), [urls]);
  const loadedRef = useRef<Set<number>>(new Set());
  const phaseRef = useRef(PAUSED);
  // performance.now() of the last look at what is on screen, and the timer of the one look that is due.
  const lastLookRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every loaded texture, kept only for cleanup (the `textures` state array
  // above is what shader consumers read).
  const loadedAtlasesRef = useRef<Map<number, THREE.Texture>>(new Map());
  // Bumped whenever the url set changes, the component unmounts, or the WebGL context is lost or restored (in
  // the event itself, not in an effect after it: a band or a failed request may run in between). loadNext
  // captures the epoch active when it starts a load; if the epoch has moved on by the time that load resolves,
  // the result is disposed instead of written into state and the queue of the new epoch is left alone, so
  // neither an unmounted component, a stale data set nor a dead context ever keeps a texture/bitmap.
  const epochRef = useRef(0);

  // Reset per data load and per restored context (fresh, empty atlas state),
  // and dispose whatever the previous url set had already loaded.
  useEffect(() => {
    epochRef.current += 1;
    loadedRef.current = new Set();
    phaseRef.current = PAUSED;
    for (const texture of loadedAtlasesRef.current.values()) texture.dispose();
    loadedAtlasesRef.current = new Map();
    loadedSheets.clear();

    return () => {
      loadedSheets.clear();
      epochRef.current += 1;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      for (const texture of loadedAtlasesRef.current.values()) texture.dispose();
      loadedAtlasesRef.current = new Map();
    };
  }, [urls, restores]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = () => {
      // In the event, so the sheet in flight is dropped at its next step whatever runs first.
      epochRef.current += 1;
      phaseRef.current = HALTED;
    };
    const onRestored = () => {
      // Also here: the effect above only runs after the next commit, and a band of a load that began while the
      // context was being lost must not commit a texture after the reset below.
      epochRef.current += 1;
      phaseRef.current = HALTED;
      setTextures(urls.map(() => null));
      setRestores((n) => n + 1);
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, urls]);

  // Declared before the useFrame below (which calls it) rather than relying
  // on function-declaration hoisting: real hoisting makes this work at
  // runtime either way, but keeping definition-before-use in source order
  // matches the static analysis the react-hooks lint plugin does.
  function loadNext() {
    if (phaseRef.current === LOADING || phaseRef.current === HALTED) return;
    if (gl.getContext().isContextLost()) {
      // Lost before its event arrived: the restore starts the queue again.
      phaseRef.current = HALTED;
      return;
    }
    if (!coversNear(camera.zoom, get().size.height)) {
      // Zoomed back out: the frame callback below starts the queue again at the next zoom in.
      phaseRef.current = PAUSED;
      return;
    }
    lastLookRef.current = performance.now();
    countVisibleSpritesByAtlas(atlasIndexByPosition, positionsRef.current, camera, counts);
    // The album picked in Explore is drawn from its sheet wherever the camera is on its way to (the same
    // condition as u_selectedIndex in AlbumField).
    const { focus, selected } = useMapStore.getState().input;
    if (!focus && selected !== null && selected >= 0 && selected < atlasIndexByPosition.length) {
      const sheet = atlasIndexByPosition[selected];
      if (sheet < counts.length) counts[sheet] += 1;
    }
    // The sheet still to load with the most albums on screen (the lowest sheet on a tie); -1 when none has any.
    let nextIndex = -1;
    let remaining = 0;
    for (let i = 0; i < urls.length; i++) {
      if (loadedRef.current.has(i)) continue;
      remaining++;
      if (counts[i] > 0 && (nextIndex < 0 || counts[i] > counts[nextIndex])) nextIndex = i;
    }
    if (remaining === 0) {
      phaseRef.current = DONE;
      return;
    }
    if (nextIndex < 0) {
      // Nothing on screen needs a sheet: the frame callback below has it looked at again as the camera moves.
      phaseRef.current = WAITING;
      return;
    }
    // Atlas-0 goes first when it is needed at all (it is the default/most common sheet).
    if (loadedRef.current.size === 0 && counts[0] > 0) nextIndex = 0;

    const myEpoch = epochRef.current;
    phaseRef.current = LOADING;
    const current = () => epochRef.current === myEpoch;
    loadBitmap(urls[nextIndex])
      // The url set changed, the component unmounted or the context was lost
      // while this atlas was in flight: uploadAtlas releases it and gives null,
      // so nothing is written into stale state.
      .then((bitmap) => uploadAtlas(gl, bitmap, current))
      .then((texture) => {
        if (!texture) return;
        if (!current()) {
          texture.dispose();
          return;
        }
        loadedRef.current.add(nextIndex);
        loadedAtlasesRef.current.set(nextIndex, texture);
        loadedSheets.add(nextIndex);
        setTextures((prev) => {
          const next = [...prev];
          next[nextIndex] = texture;
          return next;
        });
        requestRender();
      })
      .catch((err) => {
        // A request that fails after its epoch ended says nothing about the sheet in the new one (a restored
        // context, a new data set), which fetches it again.
        if (!current()) return;
        console.error("atlas load failed", urls[nextIndex], err);
        // Mark it loaded anyway so a single bad sheet doesn't wedge the
        // queue; the corresponding sprites just stay unloaded (u_atlasLoaded
        // stays 0 for that index).
        loadedRef.current.add(nextIndex);
      })
      .finally(() => {
        // The phase belongs to the queue of the current epoch.
        if (!current()) return;
        phaseRef.current = WAITING;
        loadNext();
      });
  }

  function lookAgain() {
    timerRef.current = null;
    if (phaseRef.current === WAITING) loadNext();
  }

  useFrame((state) => {
    const phase = phaseRef.current;
    if (phase === PAUSED) {
      if (!coversNear(camera.zoom, state.size.height)) return;
      loadNext();
      if (phaseRef.current !== WAITING) return;
    } else if (phase !== WAITING) return;
    // Waiting for an album of a sheet that is not loaded to come into view. The look itself is never made in
    // the frame: this only makes sure that one is due after it, RECHECK_MS after the last one at the earliest.
    // Frames stop when the camera does, so the last movement would otherwise go unseen.
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(lookAgain, Math.max(0, RECHECK_MS - (performance.now() - lastLookRef.current)));
  });

  return textures;
}
