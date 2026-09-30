"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { ATLAS_PER_SHEET } from "@/lib/data/sprites";
import type { MapData } from "../data";
import { requestRender } from "../state/invalidate";
import { getOverviewFraming } from "../state/view";

// ImageBitmapLoader decodes off the main thread (a worker + createImageBitmap),
// avoiding the 50-150ms main-thread decode hitch TextureLoader causes per
// atlas. imageOrientation "none" and premultiplyAlpha
// "none" keep the decode from applying any browser-default transforms our
// pipeline doesn't expect.
const loader = new THREE.ImageBitmapLoader();
loader.setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });

// Atlases load only once the camera is actually zoomed past the point where
// covers are legible; at the overview zoom nothing benefits from the download
// and decode of a sheet. Real camera.zoom, not the normalized zoomT used for
// shader uniforms, expressed as a multiple of the fitted overview zoom: at
// 2.1x fit the sprite is about 20px, just before the shader's disc-to-cover
// cross-fade starts at 24px (see SIZE_CURVE_POWER in shaders/album.ts), so no
// atlas request lands before the visitor has actually zoomed in.
const ATLAS_ZOOM_THRESHOLD_FIT_MULTIPLE = 2.1;
// Absolute cap on the gate so it is always reachable below CameraRig's
// MAX_ZOOM (5): with fitZoom clamped as high as 5, 2.1x fit would be 10.5.
const ATLAS_ZOOM_THRESHOLD_MAX = 4.5;

function configureAtlasTexture(bitmap: ImageBitmap): THREE.Texture {
  const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  // Pipeline atlases are laid out with row 0 at the top (PIL pixel space),
  // and atlasSlot().v is the row's top edge as a fraction of the sheet. Disable the
  // default flipY so v=0 still maps to the top row of the image.
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
  return tex;
}

interface LoadedAtlas {
  texture: THREE.Texture;
  bitmap: ImageBitmap;
}

/** Disposes both the GPU-side texture and the decoded ImageBitmap backing
 * it. Three's Texture.dispose() only releases the GPU upload; the
 * ImageBitmap itself (a separate, often large, decoded-pixel resource held
 * by the browser) needs its own close() call or it leaks until GC. */
function disposeLoadedAtlas(loaded: LoadedAtlas): void {
  loaded.texture.dispose();
  loaded.bitmap.close();
}

function loadAtlas(url: string): Promise<LoadedAtlas> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (result) => {
        const bitmap = result as unknown as ImageBitmap;
        resolve({ texture: configureAtlasTexture(bitmap), bitmap });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

/** Atlas sheet of every album (album i sits on sheet floor(i / ATLAS_PER_SHEET)). */
function buildAtlasIndexByPosition(data: MapData): Int16Array {
  const out = new Int16Array(data.n);
  for (let i = 0; i < data.n; i++) out[i] = Math.floor(i / ATLAS_PER_SHEET);
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
 * Loads atlas-0 once the camera crosses ATLAS_ZOOM_THRESHOLD, then the
 * remaining sheets one at a time, always picking whichever not-yet-loaded
 * sheet currently covers the most on-screen sprites (recomputed each time a
 * sheet finishes, since the camera may have moved during the load). Reads
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
  // Every loaded texture + its backing ImageBitmap, kept only for cleanup
  // (the `textures` state array above is what shader consumers read).
  const loadedAtlasesRef = useRef<Map<number, LoadedAtlas>>(new Map());
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
    for (const loaded of loadedAtlasesRef.current.values()) {
      disposeLoadedAtlas(loaded);
    }
    loadedAtlasesRef.current = new Map();

    return () => {
      epochRef.current += 1;
      for (const loaded of loadedAtlasesRef.current.values()) {
        disposeLoadedAtlas(loaded);
      }
      loadedAtlasesRef.current = new Map();
    };
  }, [urls]);

  // Declared before the useFrame below (which calls it) rather than relying
  // on function-declaration hoisting: real hoisting makes this work at
  // runtime either way, but keeping definition-before-use in source order
  // matches the static analysis the react-hooks lint plugin does.
  function loadNext() {
    if (loadingRef.current) return;
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
    loadAtlas(urls[nextIndex])
      .then((loaded) => {
        if (epochRef.current !== myEpoch) {
          // The url set changed or the component unmounted while this atlas
          // was in flight: don't write into stale state, just release it.
          disposeLoadedAtlas(loaded);
          return;
        }
        loadedRef.current.add(nextIndex);
        loadedAtlasesRef.current.set(nextIndex, loaded);
        setTextures((prev) => {
          const next = [...prev];
          next[nextIndex] = loaded.texture;
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

  useFrame(() => {
    if (startedRef.current) return;
    const threshold = Math.min(
      ATLAS_ZOOM_THRESHOLD_FIT_MULTIPLE * getOverviewFraming().zoom,
      ATLAS_ZOOM_THRESHOLD_MAX,
    );
    if (camera.zoom < threshold) return;
    startedRef.current = true;
    loadNext();
  });

  return textures;
}
