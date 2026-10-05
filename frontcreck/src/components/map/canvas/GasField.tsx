"use client";

import { useEffect, useMemo, useRef } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { ThemeData } from "@/lib/data/theme";
import { easeOutCubic, prefersReducedMotion } from "@/lib/media";
import { STOP_IDS, type StopId } from "@/lib/types";
import { STOP_T, type MapData } from "../data";
import {
  GAS_DIMMED_STRENGTH,
  GAS_FRAGMENT_SHADER,
  GAS_QUAD_SCALE,
  GAS_TEXTURE_PX,
  GAS_BUSY_UPLOAD_CAP_MS,
  GAS_FIRST_UPLOAD_CAP_MS,
  GAS_UPLOAD_GAP_MS,
  GAS_UPLOAD_MAX_WAIT_MS,
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
  gasUploadOverdue,
  gasUploadWait,
  gasUrl,
  stopsOnPath,
  stopsShown,
} from "../shaders/gas";
import { useMapStore } from "../state/mapStore";
import { coverCssPx, pxPerWorld } from "../state/zoomLimits";

// Decoded off the main thread. The alpha channel is data (what the dust lets through), so it must not be
// multiplied into the colour: premultiplyAlpha "none", and never a 2D canvas.
const loader = new THREE.ImageBitmapLoader();
loader.setOptions({ imageOrientation: "none", premultiplyAlpha: "none" });

interface LoadedGas {
  texture: THREE.Texture;
  /** The decoded image, 16 MB. Closed as soon as the GPU has it (uploadGas). */
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

/** Uploads the image and builds its mips now, outside a frame, then frees the decoded copy: the GPU holds the
 * only one from here on (three keeps no pixels). After a lost WebGL context the image is fetched again. */
function uploadGas(gl: THREE.WebGLRenderer, g: LoadedGas): void {
  gl.initTexture(g.texture);
  g.bitmap.close();
}

function disposeGas(g: LoadedGas): void {
  g.texture.dispose();
  g.bitmap.close(); // closing twice is allowed
}

function setGasFlag(value: "loading" | "ready" | "off"): void {
  if (window.__rmr) window.__rmr.gas = value;
}

/**
 * The nebula gas: one quad in world space under the album points, textured with the stop baked at build time.
 * The current stop's texture loads first. The other two load only on an interactive map, in an idle slot after
 * the first is on screen (or at once when the slider asks); the dimmed backdrop loads only the stop it shows.
 * An image that is needed on screen is uploaded once the GPU has finished the frames already asked of it. One
 * that is not is uploaded only in a quiet moment, never during a pan, a zoom, a hover or a camera move, and one
 * at a time; if no quiet moment comes for four seconds it goes in at the next idle moment.
 * Nothing here draws at rest: the dim and the pool ask for another frame only while they are easing, and a
 * texture that arrives asks for one frame. The zoom curve and deep zoom are a pure function of the camera, so
 * they change only in frames the camera has already asked for.
 */
export function GasField({ data, theme }: { data: MapData; theme: ThemeData }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const enabled = gasTextureFits(gl.capabilities.maxTextureSize);
  const loaded = useRef<Partial<Record<StopId, THREE.Texture>>>({});
  // Strength factor of the dimmed pages, eased like AlbumField's dot alpha; -1 until the first frame.
  const dim = useRef(-1);
  // Pool amount (0 to 1) and its easing; value -1 until the first frame.
  const pool = useRef({ value: -1, from: 0, to: 0, start: 0 });
  // World centre and radius of the pool; kept after the album closes so the pool fades out in place.
  const poolAt = useRef<[number, number, number]>([0, 0, 1]);
  // When the map last drew a frame (page clock): late gas images are not uploaded while it is drawing.
  const frameAt = useRef(-Infinity);

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
    const store: Partial<Record<StopId, THREE.Texture>> = {};
    loaded.current = store;
    // A stop is "started" from the moment it is scheduled, also while its fetch still waits for an idle slot.
    const started = new Set<StopId>();
    const fetching = new Set<StopId>();
    let settled = 0;
    let firstIn = false;
    let idle: { cancel: () => void } | null = null;
    // Goes up when the WebGL context is lost: a fetch started before that belongs to the old context and is dropped.
    let gen = 0;
    let lost = false;
    // Decoded images of stops that are not on screen, waiting for a quiet moment to be uploaded, with the time
    // each began to wait.
    const waiting = new Map<StopId, { g: LoadedGas; since: number }>();
    let quiet: { cancel: () => void } | null = null;
    // Decoded images that are needed on screen: uploaded one at a time, each once the GPU has caught up.
    const urgent: [StopId, LoadedGas][] = [];
    let urgentBusy: { cancel: () => void } | null = null;
    let lastUpload = -Infinity;
    let afterPaint: { cancel: () => void } | null = null;
    let lastInput = -Infinity;
    const onInput = () => {
      lastInput = performance.now();
    };
    // 'loading' while any started stop is unsettled, 'ready' once every started stop is in or has failed.
    function flag(): void {
      if (alive) setGasFlag(settled === started.size ? "ready" : "loading");
    }
    function fetchStop(stop: StopId): void {
      if (!alive || fetching.has(stop)) return;
      started.add(stop);
      flag();
      // While the context is lost nothing can be uploaded; the stop is fetched when the context is back.
      if (lost) return;
      fetching.add(stop);
      const mine = gen;
      loadGas(gasUrl(stop))
        .then((g) => {
          // (the context can be lost a moment before its event arrives)
          if (!alive || mine !== gen || gl.getContext().isContextLost()) {
            disposeGas(g);
            return;
          }
          // The stop on screen (or the first to arrive, which stands in for it) goes in as soon as the GPU has
          // caught up. Any other waits for a quiet moment: an upload takes main-thread time that a pan, a zoom
          // or a hover would feel.
          if (onScreen(stop)) pushUrgent(stop, g);
          else {
            waiting.set(stop, { g, since: performance.now() });
            pump();
          }
        })
        .catch((err) => {
          if (!alive || mine !== gen) return;
          console.error("gas texture failed", gasUrl(stop), err);
          settle();
        });
    }
    /** True when this stop is, or is about to be, what the quad shows (or nothing is shown yet). */
    function onScreen(stop: StopId): boolean {
      const s = useMapStore.getState();
      return stop === s.input.stop || stopsShown(s.sliderT).includes(stop) || !STOP_IDS.some((id) => store[id]);
    }
    function settle(): void {
      settled += 1;
      flag();
      if (!firstIn) {
        firstIn = true;
        queueRest();
      }
    }
    /** Uploads a decoded stop, outside a frame, so the first frame that shows it does not stall on it. */
    function take(stop: StopId, g: LoadedGas): void {
      if (gl.getContext().isContextLost()) {
        disposeGas(g); // the lost-context handler runs next and starts over
        return;
      }
      uploadGas(gl, g);
      store[stop] = g.texture;
      // frameloop="demand": a texture arriving is not an input event. Draw one frame if this stop is on
      // screen now, or if nothing is (it may stand in until the wanted stop arrives).
      if (stopsShown(useMapStore.getState().sliderT).includes(stop) || !mesh.visible) invalidate();
      settle();
    }
    function later(fn: () => void, ms: number): { cancel: () => void } {
      const handle = window.setTimeout(() => {
        quiet = null;
        fn();
      }, ms);
      return { cancel: () => window.clearTimeout(handle) };
    }
    /** Runs fn when the main thread has nothing else to do, or after `timeout` ms if that never happens. A
     * timer alone is not proof of a quiet map: after a slow frame an overdue timer can run before the input
     * that queued up behind that frame. */
    function whenIdle(fn: () => void, timeout?: number): { cancel: () => void } {
      if (typeof window.requestIdleCallback !== "function") return later(fn, 50);
      const handle = window.requestIdleCallback(
        () => {
          quiet = null;
          fn();
        },
        timeout === undefined ? undefined : { timeout },
      );
      return { cancel: () => window.cancelIdleCallback(handle) };
    }
    /**
     * Runs fn once the GPU has finished everything the map has asked of it so far, or after `capMs`. The first
     * call into WebGL that needs an answer (three asks for an extension when it uploads its first mipmapped
     * texture) blocks the main thread until the renderer has drawn what is queued; on a software renderer that
     * is the map's whole first frame, 250 ms and more (measured). A fence is asked for and polled from timers
     * instead, which blocks nothing. On a GPU it is signalled within a few ms.
     */
    function whenGpuDone(fn: () => void, capMs: number, firstLookMs = 0): { cancel: () => void } {
      const ctx = gl.getContext() as WebGL2RenderingContext;
      const sync = typeof ctx.fenceSync === "function" ? ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (sync) ctx.flush();
      const t0 = performance.now();
      let handle = 0;
      let done = false;
      const finish = () => {
        done = true;
        if (sync) ctx.deleteSync(sync);
      };
      const poll = () => {
        if (done) return;
        // (the status of a fence only changes between tasks, so the first look is in a later task too)
        const ready = !sync || ctx.isContextLost() || ctx.getSyncParameter(sync, ctx.SYNC_STATUS) === ctx.SIGNALED;
        if (ready || performance.now() - t0 >= capMs) {
          finish();
          fn();
        } else handle = window.setTimeout(poll, 8);
      };
      handle = window.setTimeout(poll, firstLookMs);
      return {
        cancel: () => {
          window.clearTimeout(handle);
          if (!done) finish();
        },
      };
    }
    function pushUrgent(stop: StopId, g: LoadedGas): void {
      urgent.push([stop, g]);
      runUrgent();
    }
    function runUrgent(): void {
      if (!alive || urgentBusy || urgent.length === 0) return;
      const first = !STOP_IDS.some((id) => store[id]);
      urgentBusy = whenGpuDone(
        () => {
          urgentBusy = null;
          const next = urgent.shift();
          if (next) take(next[0], next[1]);
          lastUpload = performance.now();
          runUrgent();
        },
        first ? GAS_FIRST_UPLOAD_CAP_MS : GAS_BUSY_UPLOAD_CAP_MS,
        // never two uploads in one frame
        Math.max(0, lastUpload + GAS_UPLOAD_GAP_MS - performance.now()),
      );
    }
    const quietFor = () => gasUploadWait(performance.now(), lastInput, frameAt.current);
    /** Uploads one waiting stop once the map is quiet, else looks again when it may be. One upload per quiet
     * moment, so two images that arrive together never share a frame. An image that has waited too long (the
     * visitor never stops moving) goes in at the next idle moment instead, and the others' clocks restart. */
    function pump(): void {
      if (!alive || quiet !== null || waiting.size === 0) return;
      const [stop, entry] = waiting.entries().next().value!;
      const overdue = gasUploadOverdue(performance.now(), entry.since);
      const wait = quietFor();
      if (wait > 0 && !overdue) {
        quiet = later(pump, Math.min(wait, Math.max(0, entry.since + GAS_UPLOAD_MAX_WAIT_MS - performance.now())));
        return;
      }
      quiet = whenIdle(
        () => {
          if (!alive || waiting.get(stop) !== entry) return pump();
          if (quietFor() > 0 && !gasUploadOverdue(performance.now(), entry.since)) return pump();
          waiting.delete(stop);
          if (overdue) for (const other of waiting.values()) other.since = performance.now();
          pushUrgent(stop, entry.g);
          if (waiting.size > 0) quiet = later(pump, GAS_UPLOAD_GAP_MS);
        },
        // Idle time may never come while the visitor keeps the map moving on a slow renderer.
        overdue ? 200 : undefined,
      );
    }
    /** The slider asked for another stop. Of the images that wait, those the morph will show are uploaded
     * now; "now" is after the frame that paints the new list, so the click itself stays free of uploads. Until
     * they are in, the stop on screen stands in (gasPair). An image the morph never shows goes on waiting. */
    function takeForMorph(path: StopId[]): void {
      if (!path.some((stop) => waiting.has(stop)) || afterPaint) return;
      let timer = 0;
      const frame = window.requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          afterPaint = null;
          const shown = stopsOnPath(useMapStore.getState().sliderT, STOP_T[useMapStore.getState().input.stop]);
          for (const stop of shown) {
            const entry = waiting.get(stop);
            if (!entry) continue;
            waiting.delete(stop);
            pushUrgent(stop, entry.g);
          }
        }, 0);
      });
      afterPaint = {
        cancel: () => {
          window.cancelAnimationFrame(frame);
          window.clearTimeout(timer);
        },
      };
    }
    function dropWaiting(): void {
      quiet?.cancel();
      quiet = null;
      urgentBusy?.cancel();
      urgentBusy = null;
      afterPaint?.cancel();
      afterPaint = null;
      for (const entry of waiting.values()) disposeGas(entry.g);
      waiting.clear();
      for (const [, g] of urgent) disposeGas(g);
      urgent.length = 0;
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
      // The slider asked for a stop: the stops its morph passes are fetched at once, whether or not they were
      // waiting for an idle slot, and those already decoded are uploaded after the next paint.
      if (s.input.stop !== prev.input.stop) {
        const path = stopsOnPath(s.sliderT, STOP_T[s.input.stop]);
        for (const stop of path) fetchStop(stop);
        takeForMorph(path);
      }
      // The backdrop became the map (same page, no reload): the other stops are started now, so the flag goes
      // back to 'loading' until they are in.
      if (s.input.interactive && !prev.input.interactive) schedule(gasStopsToStart(s.input.stop, true));
    });
    // A lost WebGL context takes the uploaded gas with it, and the decoded images were freed after upload. So
    // when the context is lost every stop is forgotten (the quad hides and the flag says 'loading'), and when it
    // is restored the started stops are fetched again, in the same order as at the start: the stop on screen at
    // once, the others in an idle slot. The files come from the HTTP cache.
    const canvas = gl.domElement;
    const onLost = () => {
      lost = true;
      gen += 1;
      idle?.cancel();
      idle = null;
      dropWaiting();
      for (const stop of STOP_IDS) {
        store[stop]?.dispose();
        delete store[stop];
      }
      fetching.clear();
      settled = 0;
      firstIn = false;
      flag();
    };
    const onRestored = () => {
      lost = false;
      noise.needsUpdate = true;
      fetchStop(useMapStore.getState().input.stop);
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    // Input anywhere on the page counts: a hover over the map, a wheel zoom, a drag, the keyboard.
    const INPUTS = ["pointerdown", "pointermove", "wheel", "keydown", "touchmove"] as const;
    for (const type of INPUTS) window.addEventListener(type, onInput, { capture: true, passive: true });
    // The end of every drawn frame counts too (useFrame below stamps its start): a slow frame is not a quiet map.
    const offFrame = addAfterEffect(() => {
      frameAt.current = performance.now();
    });
    return () => {
      alive = false;
      offFrame();
      idle?.cancel();
      dropWaiting();
      for (const type of INPUTS) window.removeEventListener(type, onInput, { capture: true });
      unsubscribe();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const stop of STOP_IDS) store[stop]?.dispose();
      loaded.current = {};
    };
  }, [enabled, gl, invalidate, mesh, noise]);

  // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
  useFrame((state, delta) => {
    frameAt.current = performance.now();
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
    u.u_gasA.value = got[pair.a]!;
    u.u_gasB.value = got[pair.b]!;
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
