"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { atlasSheetOf } from "@/lib/data/sprites";
import type { MapData } from "../data";
import { requestRender } from "../state/invalidate";
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

/** An empty texture of the sheet's size, allocated on the GPU with its mipmap levels and no pixels yet. */
function createAtlasTexture(renderer: THREE.WebGLRenderer, width: number, height: number): THREE.Texture {
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
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  renderer.initTexture(tex);
  return tex;
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Copies a decoded sheet into a new texture, a band per animation frame, building the mipmaps with the last
 * band, and releases the decoded image: the texture is the only copy kept (a decoded 3072 px sheet is 38 MB,
 * its texture with mipmaps 50 MB). Resolves with null, having released everything, when `current` turns false
 * on the way (the data set changed, the map unmounted or the WebGL context was lost).
 */
async function uploadAtlas(renderer: THREE.WebGLRenderer, bitmap: ImageBitmap, current: () => boolean): Promise<THREE.Texture | null> {
  const { width, height } = bitmap;
  const tex = createAtlasTexture(renderer, width, height);
  // Never uploaded itself: only the source of the copies below.
  const source = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  const bands = uploadBands(height);
  const region = new THREE.Box2();
  const at = new THREE.Vector2();
  try {
    // The mipmaps are built once, by the copy of the last band.
    tex.generateMipmaps = false;
    for (let i = 0; i < bands.length; i++) {
      await nextFrame();
      if (!current()) {
        tex.dispose();
        return null;
      }
      const [y0, y1] = bands[i];
      if (i === bands.length - 1) tex.generateMipmaps = true;
      renderer.copyTextureToTexture(source, tex, region.set(at.set(0, y0), new THREE.Vector2(width, y1)), at.set(0, y0));
    }
    return tex;
  } catch (err) {
    tex.dispose();
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

/**
 * Cheap O(n) pass over the current interpolated positions, counting how many
 * project inside the camera's NDC frustum (i.e. currently on screen) per
 * atlas index. Used to decide which not-yet-loaded sheet to fetch next, so
 * covers the user can actually see arrive before covers that are off-screen
 * .
 */
function countVisibleSpritesByAtlas(
  atlasIndexByPosition: Int16Array,
  positionsRef: React.RefObject<Float32Array>,
  camera: THREE.OrthographicCamera,
  atlasCount: number,
): number[] {
  const counts = new Array(atlasCount).fill(0);
  const positions = positionsRef.current;
  const n = atlasIndexByPosition.length;
  if (positions.length < n * 2) return counts;
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const atlasIndex = atlasIndexByPosition[i];
    if (atlasIndex < 0 || atlasIndex >= atlasCount) continue;
    v.set(positions[i * 2], positions[i * 2 + 1], 0);
    v.project(camera);
    if (v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1) {
      counts[atlasIndex]++;
    }
  }
  return counts;
}

/**
 * Loads atlas-0 once covers are about to show (ATLAS_LOAD_PX), then the
 * remaining sheets one at a time, always picking whichever not-yet-loaded
 * sheet currently covers the most on-screen sprites (recomputed each time a
 * sheet finishes, since the camera may have moved during the load). The
 * queue waits while the camera is zoomed back out to where no covers show
 * and goes on at the next zoom in: a catalog of 10,467 albums has eleven
 * sheets (about 25 MB, 50 MB of texture each), which a glance in and out
 * should not fetch. Reads
 * camera.zoom directly off the live THREE camera inside useFrame (no React
 * state or prop feeds the zoom in), and only ever flips the `textures` state
 * array when a texture actually finishes loading or the threshold is crossed
 * for the first time, not once per frame.
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
  const loadedRef = useRef<Set<number>>(new Set());
  const loadingRef = useRef(false);
  const startedRef = useRef(false);
  // Every loaded texture, kept only for cleanup (the `textures` state array
  // above is what shader consumers read).
  const loadedAtlasesRef = useRef<Map<number, THREE.Texture>>(new Map());
  // Bumped whenever the url set changes or the component unmounts. loadNext
  // captures the epoch active when it starts a load; if the epoch has moved
  // on by the time that load resolves (unmount, or a new MapData swapped
  // in), the result is disposed instead of written into state, so neither
  // an unmounted component nor a stale data set ever leaks a texture/bitmap.
  const epochRef = useRef(0);

  // Reset per data load (a fresh MapData means fresh, empty atlas state),
  // and dispose whatever the previous url set had already loaded.
  useEffect(() => {
    epochRef.current += 1;
    loadedRef.current = new Set();
    loadingRef.current = false;
    startedRef.current = false;
    for (const texture of loadedAtlasesRef.current.values()) texture.dispose();
    loadedAtlasesRef.current = new Map();
    loadedSheets.clear();

    return () => {
      loadedSheets.clear();
      epochRef.current += 1;
      for (const texture of loadedAtlasesRef.current.values()) texture.dispose();
      loadedAtlasesRef.current = new Map();
    };
  }, [urls, restores]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onRestored = () => {
      setTextures(urls.map(() => null));
      setRestores((n) => n + 1);
    };
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => canvas.removeEventListener("webglcontextrestored", onRestored);
  }, [gl, urls]);

  // Declared before the useFrame below (which calls it) rather than relying
  // on function-declaration hoisting: real hoisting makes this work at
  // runtime either way, but keeping definition-before-use in source order
  // matches the static analysis the react-hooks lint plugin does.
  function loadNext() {
    if (loadingRef.current) return;
    if (!coversNear(camera.zoom, get().size.height)) {
      // Zoomed back out: the frame callback below starts the queue again at the next zoom in.
      startedRef.current = false;
      return;
    }
    const remaining: number[] = [];
    for (let i = 0; i < urls.length; i++) {
      if (!loadedRef.current.has(i)) remaining.push(i);
    }
    if (remaining.length === 0) return;

    // Atlas-0 always goes first (it is the default/most common sheet and
    // there is no "visible count" yet on the very first load). After that,
    // load whichever remaining sheet currently covers the most on-screen
    // sprites.
    let nextIndex = remaining[0];
    if (loadedRef.current.size > 0 || !remaining.includes(0)) {
      const counts = countVisibleSpritesByAtlas(
        atlasIndexByPosition,
        positionsRef,
        camera,
        urls.length,
      );
      nextIndex = remaining.reduce(
        (best, i) => (counts[i] > counts[best] ? i : best),
        remaining[0],
      );
    }

    const myEpoch = epochRef.current;
    loadingRef.current = true;
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
        console.error("atlas load failed", urls[nextIndex], err);
        // Mark it loaded anyway so a single bad sheet doesn't wedge the
        // queue; the corresponding sprites just stay unloaded (u_atlasLoaded
        // stays 0 for that index).
        loadedRef.current.add(nextIndex);
      })
      .finally(() => {
        loadingRef.current = false;
        if (epochRef.current === myEpoch) loadNext();
      });
  }

  useFrame((state) => {
    if (startedRef.current) return;
    if (!coversNear(camera.zoom, state.size.height)) return;
    startedRef.current = true;
    loadNext();
  });

  return textures;
}
