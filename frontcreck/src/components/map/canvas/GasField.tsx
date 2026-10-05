"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { ThemeData } from "@/lib/data/theme";
import { easeOutCubic, prefersReducedMotion } from "@/lib/media";
import { STOP_IDS, type StopId } from "@/lib/types";
import type { MapData } from "../data";
import {
  GAS_DIMMED_STRENGTH,
  GAS_FRAGMENT_SHADER,
  GAS_QUAD_SCALE,
  GAS_TEXTURE_PX,
  GAS_VERTEX_SHADER,
  POOL_MIN_PX,
  POOL_MS,
  focusPool,
  gasCurve,
  gasDust,
  gasNoise,
  gasPair,
  gasStopsToStart,
  gasTextureFits,
  gasUrl,
  stopMix,
} from "../shaders/gas";
import { useMapStore } from "../state/mapStore";
import { coverCssPx, pxPerWorld } from "../state/zoomLimits";

// Decoded off the main thread. The alpha channel is data (what the dust lets through), so it must not be
// multiplied into the colour: premultiplyAlpha "none", and never a 2D canvas.
const loader = new THREE.ImageBitmapLoader();
loader.setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });

interface LoadedGas {
  texture: THREE.Texture;
  bitmap: ImageBitmap;
}

function loadGas(url: string): Promise<LoadedGas> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (result) => {
        const bitmap = result as unknown as ImageBitmap;
        const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
        // Row 0 of the image (north) stays at v = 0; the shader flips v itself.
        texture.flipY = false;
        // The shader writes display-referred values straight to the framebuffer (Scene.tsx onCreated).
        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true; // the glow and the deep zoom blur read the mips
        texture.needsUpdate = true;
        resolve({ texture, bitmap });
      },
      undefined,
      (err) => reject(err),
    );
  });
}

/** The bitmap is kept as long as the texture: after a lost WebGL context three uploads it again. */
function disposeGas(g: LoadedGas): void {
  g.texture.dispose();
  g.bitmap.close();
}

function setGasFlag(value: "loading" | "ready" | "off"): void {
  if (window.__rmr) window.__rmr.gas = value;
}

/**
 * The nebula gas: one quad in world space under the album points, textured with the stop baked at build time.
 * The current stop's texture loads first. The other two load only on an interactive map, in an idle slot after
 * the first is on screen (or at once when the slider asks); the dimmed backdrop loads only the stop it shows.
 * Nothing here draws at rest: the dim and the pool ask for another frame only while they are easing, and a
 * texture that arrives asks for one frame. The zoom curve and deep zoom are a pure function of the camera, so
 * they change only in frames the camera has already asked for.
 */
export function GasField({ data, theme }: { data: MapData; theme: ThemeData }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const enabled = gasTextureFits(gl.capabilities.maxTextureSize);
  const loaded = useRef<Partial<Record<StopId, LoadedGas>>>({});
  // Strength factor of the dimmed pages, eased like AlbumField's dot alpha; -1 until the first frame.
  const dim = useRef(-1);
  // Pool amount (0 to 1) and its easing; value -1 until the first frame.
  const pool = useRef({ value: -1, from: 0, to: 0, start: 0 });
  // World centre and radius of the pool; kept after the album closes so the pool fades out in place.
  const poolAt = useRef<[number, number, number]>([0, 0, 1]);

  const { mesh, material, noise } = useMemo(() => {
    const noiseTex = new THREE.DataTexture(gasNoise(), 256, 256, THREE.RedFormat, THREE.UnsignedByteType);
    noiseTex.colorSpace = THREE.NoColorSpace;
    noiseTex.wrapS = THREE.RepeatWrapping;
    noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.minFilter = THREE.LinearFilter;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.generateMipmaps = false;
    noiseTex.unpackAlignment = 1;
    noiseTex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      vertexShader: GAS_VERTEX_SHADER,
      fragmentShader: GAS_FRAGMENT_SHADER,
      // Opaque and under everything: drawn in the opaque pass, before the transparent album points.
      transparent: false,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_tx: { value: new THREE.Vector3(data.tx.cx, data.tx.cy, data.tx.s) },
        u_quadHalf: { value: theme.bakeHalf * GAS_QUAD_SCALE },
        u_gasA: { value: null },
        u_gasB: { value: null },
        u_noise: { value: noiseTex },
        u_mix: { value: 0 },
        u_ppr: { value: 1 },
        u_bakePpr: { value: GAS_TEXTURE_PX / (2 * theme.bakeHalf) },
        u_bakeHalf: { value: theme.bakeHalf },
        u_strength: { value: 1 },
        u_deep: { value: 0 },
        u_dust: { value: 1 },
        u_poolAmt: { value: 0 },
        u_pool: { value: new THREE.Vector3(0, 0, 1) },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    // The plane's own bounds are in quad units, not world units: never cull it.
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    quad.visible = false; // until a texture is in
    return { mesh: quad, material: mat, noise: noiseTex };
  }, [data, theme]);

  useEffect(() => {
    if (!enabled) {
      setGasFlag("off");
      return;
    }
    let alive = true;
    const store: Partial<Record<StopId, LoadedGas>> = {};
    loaded.current = store;
    // A stop is "started" from the moment it is scheduled, also while its fetch still waits for an idle slot.
    const started = new Set<StopId>();
    const fetching = new Set<StopId>();
    let settled = 0;
    let firstIn = false;
    let idle: { cancel: () => void } | null = null;
    // 'loading' while any started stop is unsettled, 'ready' once every started stop is in or has failed.
    function flag(): void {
      if (alive) setGasFlag(settled === started.size ? "ready" : "loading");
    }
    function fetchStop(stop: StopId): void {
      if (!alive || fetching.has(stop)) return;
      fetching.add(stop);
      started.add(stop);
      flag();
      loadGas(gasUrl(stop))
        .then((g) => {
          if (!alive) {
            disposeGas(g);
            return;
          }
          store[stop] = g;
          // Upload now, outside a frame, so the first frame that shows this stop does not stall on it.
          gl.initTexture(g.texture);
          // frameloop="demand": a texture arriving is not an input event. Draw one frame if this stop is on
          // screen now, or if nothing is (it may stand in until the wanted stop arrives).
          const m = stopMix(useMapStore.getState().sliderT);
          if (stop === m.a || stop === m.b || !mesh.visible) invalidate();
        })
        .catch((err) => {
          console.error("gas texture failed", gasUrl(stop), err);
        })
        .finally(() => {
          settled += 1;
          flag();
          if (!firstIn) {
            firstIn = true;
            queueRest();
          }
        });
    }
    function rest(): void {
      idle = null;
      for (const stop of [...started]) fetchStop(stop);
    }
    // The stops that are started but not yet fetched wait until the first stop is on screen, and then for an
    // idle slot, so they never compete with the first frame, the search index or the covers.
    function queueRest(): void {
      if (!alive || idle || !firstIn || fetching.size === started.size) return;
      if (typeof window.requestIdleCallback === "function") {
        const handle = window.requestIdleCallback(rest, { timeout: 600 });
        idle = { cancel: () => window.cancelIdleCallback(handle) };
      } else {
        const handle = window.setTimeout(rest, 300);
        idle = { cancel: () => window.clearTimeout(handle) };
      }
    }
    function schedule(stops: StopId[]): void {
      for (const stop of stops) started.add(stop);
      flag();
      queueRest();
    }
    // The stop on screen is fetched at once. The dimmed backdrop (Home, About, 404) starts nothing else; an
    // interactive map also starts the other two, which are fetched at idle priority.
    const first = useMapStore.getState().input;
    fetchStop(first.stop);
    schedule(gasStopsToStart(first.stop, first.interactive));
    const unsubscribe = useMapStore.subscribe((s, prev) => {
      // The slider asked for a stop: fetch it at once, whether or not it was waiting for an idle slot.
      if (s.input.stop !== prev.input.stop) fetchStop(s.input.stop);
      // The backdrop became the map (same page, no reload): the other stops are started now, so the flag goes
      // back to 'loading' until they are in.
      if (s.input.interactive && !prev.input.interactive) schedule(gasStopsToStart(s.input.stop, true));
    });
    // three rebuilds its GL state after a restored context; mark every texture so it is uploaded again.
    const canvas = gl.domElement;
    const onRestored = () => {
      for (const stop of STOP_IDS) {
        const g = store[stop];
        if (g) g.texture.needsUpdate = true;
      }
      noise.needsUpdate = true;
      invalidate();
    };
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      alive = false;
      idle?.cancel();
      unsubscribe();
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const stop of STOP_IDS) {
        const g = store[stop];
        if (g) disposeGas(g);
      }
      loaded.current = {};
    };
  }, [enabled, gl, invalidate, mesh, noise]);

  // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
  useFrame((state, delta) => {
    const { input, sliderT } = useMapStore.getState();
    const got = loaded.current;
    const pair = enabled ? gasPair(sliderT, { sonic: !!got.sonic, balanced: !!got.balanced, mood: !!got.mood }) : null;
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    mesh.visible = pair !== null;
    if (!pair) return;
    // When the nebula first showed, on the page clock. Written once; the perf script reports it.
    if (window.__rmr && window.__rmr.gasShownMs === undefined) window.__rmr.gasShownMs = performance.now();
    const u = material.uniforms;
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    u.u_gasA.value = got[pair.a]!.texture;
    u.u_gasB.value = got[pair.b]!.texture;
    u.u_mix.value = pair.k;

    const zoom = (camera as THREE.OrthographicCamera).zoom;
    const height = state.size.height;
    const ppw = pxPerWorld(zoom, height);
    const cover = coverCssPx(zoom, height);
    u.u_ppr.value = ppw * data.tx.s;
    u.u_dust.value = gasDust(cover);

    // The dimmed backdrop (Home, About, 404) eases with the dots (AlbumField). With frameloop="demand" the first
    // frame after an idle period has a delta of seconds; clamp it, or the dim would jump instead of easing.
    const reduced = prefersReducedMotion();
    const dt = Math.min(delta, 1 / 30);
    const dimTarget = input.dimmed ? GAS_DIMMED_STRENGTH : 1;
    if (dim.current < 0 || reduced) dim.current = dimTarget;
    else dim.current += (dimTarget - dim.current) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(dimTarget - dim.current) < 0.002) dim.current = dimTarget;
    else invalidate();
    // Zoom bands, and past 32 px covers the deep zoom fade to a faint remnant (strength, colour, detail, focus).
    const curve = gasCurve(cover);
    u.u_strength.value = curve.strength * dim.current;
    u.u_deep.value = curve.deep;

    // The pool: a soft dim, half desaturated area around the open album's group, at the target stop's positions.
    const focus = input.focus;
    if (focus) {
      const at = focusPool(data.pos[input.stop], [focus.seed, ...focus.recs], POOL_MIN_PX / ppw);
      if (at) poolAt.current = at;
    }
    const p = pool.current;
    const target = focus ? 1 : 0;
    const now = performance.now();
    if (p.value < 0 || reduced) {
      p.value = target;
      p.to = target;
    } else if (p.to !== target) {
      p.from = p.value;
      p.to = target;
      p.start = now;
    }
    if (p.value !== p.to) {
      const k = Math.min(1, (now - p.start) / POOL_MS);
      p.value = k >= 1 ? p.to : p.from + (p.to - p.from) * easeOutCubic(k);
      if (k < 1) invalidate();
    }
    u.u_poolAmt.value = p.value;
    const [wx, wy, wr] = poolAt.current;
    (u.u_pool.value as THREE.Vector3).set(wx / data.tx.s + data.tx.cx, wy / data.tx.s + data.tx.cy, wr / data.tx.s);
    if (window.__rmr) {
      window.__rmr.gasPool = p.value;
      window.__rmr.gasDeep = curve.deep;
    }
  });

  useEffect(() => {
    return () => {
      mesh.geometry.dispose();
      material.dispose();
      noise.dispose();
    };
  }, [mesh, material, noise]);

  return <primitive object={mesh} />;
}
