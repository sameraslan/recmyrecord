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
  gasGestureActive,
  gasImageFits,
  gasLodBias,
  gasNoise,
  gasPair,
  gasRectUniform,
  gasRestingStop,
  gasSharpBlocked,
  gasSharpPlan,
  gasSharpRetry,
  gasSharpStrips,
  gasSharpWanted,
  gasStopsToStart,
  gasTexelsPerRaw,
  gasTextureFits,
  gasUploadOverdue,
  gasUploadWait,
  gasUrl,
  type GasSharpDevice,
  stopsOnPath,
  stopsShown,
} from "../shaders/gas";
import { useMapStore } from "../state/mapStore";
import { coverCssPx, pxPerWorld } from "../state/zoomLimits";

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Decoded off the main thread. The alpha channel is data (what the dust lets through), so it must not be
// multiplied into the colour: premultiplyAlpha "none", and never a 2D canvas.
const GAS_BITMAP: ImageBitmapOptions = { imageOrientation: "none", premultiplyAlpha: "none", colorSpaceConversion: "none" };
const loader = new THREE.ImageBitmapLoader();
loader.setOptions(GAS_BITMAP);

/** Fetches and decodes an image off the main thread. Aborting `signal` drops the download; a decode that is
 * already running finishes, and the caller closes its result. */
async function fetchBitmap(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return createImageBitmap(await res.blob(), GAS_BITMAP);
}

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

/** What a stop shows when its image could not be used (it failed to load, or is not the image theme.json
 * describes): no gas and no dust, so plain sky, never another stop's gas or an image in the wrong place. */
function emptyGas(): THREE.Texture {
  const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function setGasFlag(value: "loading" | "ready" | "off"): void {
  if (window.__rmr) window.__rmr.gas = value;
}

function setSharpFlag(value: "off" | "waiting" | "loading" | StopId | undefined): void {
  if (!window.__rmr) return;
  if (value === undefined) delete window.__rmr.gasSharp;
  else window.__rmr.gasSharp = value;
}

/** The sharper image of one stop on the GPU. */
interface SharpGas {
  stop: StopId;
  texture: THREE.Texture;
}

/** The sharper image as a texture with all its mip levels allocated and nothing uploaded yet (the strips and
 * the mips follow, GasField startSharp). */
function emptySharpTexture(width: number, height: number): THREE.Texture {
  const texture = new THREE.FramebufferTexture(width, height);
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false; // switched on for the last strip, which builds the mips once
  return texture;
}

/**
 * The nebula gas: one quad in world space under the album points, textured with the stop baked at build time.
 * The current stop's texture loads first. The other two load only on an interactive map, in an idle slot after
 * the first is on screen (or at once when the slider asks); the dimmed backdrop loads only the stop it shows.
 * An image that is needed on screen is uploaded once the GPU has finished the frames already asked of it. One
 * that is not is uploaded only in a quiet moment, never during a pan, a zoom, a hover or a camera move, and one
 * at a time; if no quiet moment comes for four seconds it goes in at the next idle moment, but never while a
 * pointer is down or a wheel or pinch zoom is running.
 * On a desktop with a real GPU the stop the slider rests at then gets its sharper image (the prototype's
 * resolution), once all three first images are in: fetched at a quiet moment, decoded off the main thread, sent
 * to the GPU in strips (each cut out as a small image of its own), each in its own quiet moment, and swapped in
 * with one frame. Only one sharper image is
 * held at a time; it is freed when the slider comes to rest at another stop (gasSharpPlan).
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
  // The sharper image of one stop, when it is in.
  const sharp = useRef<SharpGas | null>(null);
  // Zoom of the last drawn frame, as the sharper image's rule reads it.
  const view = useRef({ ppr: 0, deep: 0 });
  // Per stop: the shader's rectangle, and texels per raw unit of the first and of the sharper image.
  const images = useMemo(() => {
    const of = (stop: StopId) => {
      const g = theme.gas[stop];
      return { rect: gasRectUniform(g.rect), first: gasTexelsPerRaw(g.rect, g.px[0]), sharp: gasTexelsPerRaw(g.rect, g.sharp[0]) };
    };
    return { sonic: of("sonic"), balanced: of("balanced"), mood: of("mood") };
  }, [theme]);

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
        u_bakePpr: { value: 1 },
        u_octPpr: { value: 1 },
        u_lodBias: { value: 0 },
        u_rectA: { value: new THREE.Vector4(0, 0, 1, 1) },
        u_rectB: { value: new THREE.Vector4(0, 0, 1, 1) },
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
    // Gestures: the pointers that are down (a drag, a pinch), the last wheel event (a wheel zoom, a trackpad
    // pinch), and when the last gesture ended.
    const down = new Set<number>();
    let lastWheel = -Infinity;
    let gestureEnd = -Infinity;
    const onInput = (e: Event) => {
      const now = performance.now();
      lastInput = now;
      if (e.type === "wheel") lastWheel = now;
      else if (e.type === "pointerdown") down.add((e as PointerEvent).pointerId);
      else if (e.type === "pointermove") {
        // A mouse that moves with no button held is not down, whatever became of its pointerup (a button let go
        // outside the window sends none).
        const p = e as PointerEvent;
        if (p.pointerType === "mouse" && p.buttons === 0 && down.delete(p.pointerId)) gestureEnd = now;
      }
    };
    const onPointerEnd = (e: Event) => {
      if (down.delete((e as PointerEvent).pointerId)) gestureEnd = performance.now();
    };
    const onBlur = () => {
      if (down.size > 0) gestureEnd = performance.now();
      down.clear();
    };
    const gestureActive = () => gasGestureActive(performance.now(), down.size, lastWheel);
    /** When the last gesture ended; now, while one is running. */
    const lastGesture = () => (gestureActive() ? performance.now() : Math.max(gestureEnd, lastWheel));
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
      const url = gasUrl(stop, theme.gas[stop].hash);
      loadGas(url)
        .then((g) => {
          // (the context can be lost a moment before its event arrives)
          if (!alive || mine !== gen || gl.getContext().isContextLost()) {
            disposeGas(g);
            return;
          }
          if (!gasImageFits(g.bitmap, theme.gas[stop].px)) {
            const [w, h] = theme.gas[stop].px;
            console.error("gas texture refused", url, `is ${g.bitmap.width} x ${g.bitmap.height}, theme.json says ${w} x ${h}`);
            disposeGas(g);
            noGas(stop);
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
          console.error("gas texture failed", url, err);
          noGas(stop);
        });
    }
    /** The stop's image cannot be used: the stop shows plain sky (emptyGas), and the load is settled. */
    function noGas(stop: StopId): void {
      store[stop] = emptyGas();
      if (stopsShown(useMapStore.getState().sliderT).includes(stop) || !mesh.visible) invalidate();
      settle();
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
      sharpPoke();
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
    const quietFor = () => gasUploadWait(performance.now(), lastInput, frameAt.current, gestureActive());
    /** Uploads one waiting stop once the map is quiet, else looks again when it may be. One upload per quiet
     * moment, so two images that arrive together never share a frame. An image that has waited too long (the
     * visitor's pointer never rests) goes in at the next idle moment instead, and the others' clocks restart;
     * never inside a drag, a wheel zoom or a pinch (gasUploadOverdue). The upload sits behind the GPU fence like
     * every other, and whether it may go in is asked again as the first thing after that wait. */
    function pump(): void {
      if (!alive || quiet !== null || waiting.size === 0) return;
      const [stop, entry] = waiting.entries().next().value!;
      const may = () => quietFor() === 0 || gasUploadOverdue(performance.now(), entry.since, lastGesture());
      if (!may()) {
        const capIn = Math.max(entry.since, lastGesture()) + GAS_UPLOAD_MAX_WAIT_MS - performance.now();
        quiet = later(pump, Math.max(1, Math.min(quietFor(), capIn)));
        return;
      }
      quiet = whenIdle(
        () => {
          if (!alive || waiting.get(stop) !== entry || !may()) return pump();
          quiet = whenGpuDone(
            () => {
              quiet = null;
              // The wait behind the fence was 34 to 100 ms: a drag, a zoom or a hover can have begun in it.
              if (!alive || waiting.get(stop) !== entry || urgentBusy || !may()) return pump();
              waiting.delete(stop);
              if (quietFor() > 0) for (const other of waiting.values()) other.since = performance.now();
              take(stop, entry.g);
              lastUpload = performance.now();
              if (waiting.size > 0) quiet = later(pump, GAS_UPLOAD_GAP_MS);
            },
            GAS_BUSY_UPLOAD_CAP_MS,
            // never two uploads in one frame
            Math.max(0, lastUpload + GAS_UPLOAD_GAP_MS - performance.now()),
          );
        },
        // Idle time may never come while the pointer keeps moving on a slow renderer.
        quietFor() > 0 ? 200 : undefined,
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
    /* ---- the sharper image of the stop the slider rests at ---- */
    let sharpLoading: { stop: StopId; cancel: () => void } | null = null;
    // false: this device never uses it, or its image failed twice. null until the renderer's name has been asked.
    let sharpAllowed: boolean | null = null;
    // The pending look at what the sharper image should be doing (sharpPoke).
    let sharpWait: { cancel: () => void } | null = null;
    // Failed loads so far, and the time before which it is not asked for again.
    let sharpFails = 0;
    let sharpNotBefore = -Infinity;
    const sharpOverride = window.__rmrGasSharp;
    const sharpDevice = (renderer: string): GasSharpDevice => {
      const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
      return {
        maxTextureSize: gl.capabilities.maxTextureSize,
        coarsePointer: typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches,
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        renderer,
        deviceMemory: nav.deviceMemory,
        saveData: nav.connection?.saveData,
      };
    };
    // Everything but the renderer's name needs no answer from the GPU and is decided now, so a device that never
    // uses the sharper image says 'off' from the start.
    if (sharpOverride === "off" || gasSharpBlocked(sharpDevice("")) !== null) sharpAllowed = false;
    /** Runs fn in a quiet moment: nothing drawn and no input for GAS_UPLOAD_QUIET_MS, no gesture running, and
     * the main thread idle (a timer alone is not proof: after a long task an overdue timer runs before the input
     * that queued up behind it). `notBefore` returns a time on the page clock before which it does not run. */
    function whenQuiet(fn: () => void, notBefore?: () => number): { cancel: () => void } {
      let timer = 0;
      let idleHandle = 0;
      let cancelled = false;
      const look = () => {
        if (cancelled) return;
        const wait = Math.max(quietFor(), notBefore ? notBefore() - performance.now() : 0);
        if (wait > 0) {
          timer = window.setTimeout(look, wait);
          return;
        }
        const run = () => {
          if (cancelled) return;
          if (quietFor() > 0) look();
          else fn();
        };
        if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(run);
        else timer = window.setTimeout(run, 50);
      };
      look();
      return {
        cancel: () => {
          cancelled = true;
          window.clearTimeout(timer);
          if (idleHandle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
        },
      };
    }
    /** The renderer's name is asked once, at the first quiet look: it needs an answer from the GPU process. */
    function sharpIsAllowed(): boolean {
      if (sharpAllowed === null) {
        const ctx = gl.getContext();
        const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
        // "force" (review captures and tests on a software renderer) skips only the renderer's name
        const renderer = sharpOverride === "force" ? "" : String(ctx.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : ctx.RENDERER));
        sharpAllowed = gasSharpBlocked(sharpDevice(renderer)) === null;
      }
      return sharpAllowed;
    }
    function sharpFlag(): void {
      if (!alive) return;
      setSharpFlag(sharpAllowed === false ? "off" : sharpLoading ? "loading" : (sharp.current?.stop ?? "waiting"));
    }
    function releaseSharp(): void {
      sharp.current?.texture.dispose();
      sharp.current = null;
    }
    function cancelSharp(): void {
      sharpLoading?.cancel();
      sharpLoading = null;
    }
    /** Fetches, decodes and uploads the sharper image of a stop, every step in a quiet moment. Nothing of it is
     * bound until all of it is in, so a visitor who starts to move the map only delays it. */
    function startSharp(stop: StopId): void {
      let dead = false;
      let step: { cancel: () => void } | null = null;
      let bitmap: ImageBitmap | null = null;
      // The strip that is cut and not yet on the GPU.
      let piece: ImageBitmap | null = null;
      let target: THREE.Texture | null = null;
      const mine = gen;
      const url = gasUrl(stop, theme.gas[stop].hash, true);
      // A load that is cancelled (the slider came to rest elsewhere, the context was lost, the map went away)
      // drops its download too, so it never decodes 47 MB beside the next stop's image.
      const abort = new AbortController();
      const end = () => {
        dead = true;
        abort.abort();
        step?.cancel();
        bitmap?.close();
        piece?.close();
        target?.dispose();
      };
      const fail = (why: unknown) => {
        if (dead) return;
        console.error("sharper gas image failed", url, why);
        end();
        sharpLoading = null;
        sharpFails += 1;
        // Asked for once more at a later quiet moment; after that not again on this map (the first image stays).
        const retry = gasSharpRetry(sharpFails);
        if (retry === null) sharpAllowed = false;
        else {
          sharpNotBefore = performance.now() + retry;
          sharpPoke();
        }
        sharpFlag();
      };
      sharpLoading = { stop, cancel: end };
      step = whenQuiet(() => {
        step = null;
        fetchBitmap(url, abort.signal).then((image) => {
          if (dead || !alive || mine !== gen) return image.close();
          bitmap = image;
          const [w, h] = theme.gas[stop].sharp;
          if (!gasImageFits(image, theme.gas[stop].sharp)) return fail(`is ${image.width} x ${image.height}, theme.json says ${w} x ${h}`);
          const texture = emptySharpTexture(w, h);
          target = texture;
          const strips = gasSharpStrips(h);
          const at = new THREE.Vector2();
          let i = -1; // -1 allocates the texture; 0 and up send strip i
          /** Sends what is ready (the allocation, or the strip that was cut) in a quiet moment, and once the
           * GPU has finished the strip before: never two in one frame. */
          const send = () => {
            step = whenQuiet(() => {
              step = whenGpuDone(
                () => {
                  step = null;
                  if (dead) return;
                  // The wait behind the fence was 34 to 100 ms: a drag, a zoom or a hover can have begun in
                  // it. Then this strip (and with the last one the mip build) waits for the next quiet moment.
                  if (quietFor() > 0) return send();
                  if (gl.getContext().isContextLost()) return; // the lost-context handler cancels this load
                  if (i < 0) gl.initTexture(texture);
                  else {
                    if (i === strips.length - 1) texture.generateMipmaps = true;
                    // The strip is a whole image of its own, so the upload has no row offset to get wrong;
                    // only where it goes (row strips[i][0]) is given. The carrier texture is never uploaded.
                    gl.copyTextureToTexture(new THREE.Texture(piece as unknown as HTMLImageElement), texture, null, at.set(0, strips[i][0]));
                    piece?.close();
                    piece = null;
                  }
                  i += 1;
                  if (i < strips.length) return cut();
                  // All of it is on the GPU: free the decoded copy, swap it in, draw one frame.
                  image.close();
                  bitmap = null;
                  target = null;
                  sharpLoading = null;
                  sharpFails = 0;
                  sharp.current = { stop, texture };
                  if (stopsShown(useMapStore.getState().sliderT).includes(stop)) invalidate();
                  sharpFlag();
                },
                GAS_BUSY_UPLOAD_CAP_MS,
                GAS_UPLOAD_GAP_MS,
              );
            });
          };
          /** Cuts strip i out of the decoded image as an image of its own (a copy of its rows, about 3 MB),
           * then sends it. */
          const cut = () => {
            const [y0, y1] = strips[i];
            createImageBitmap(image, 0, y0, w, y1 - y0, GAS_BITMAP).then((strip) => {
              if (dead) return strip.close();
              piece = strip;
              send();
            }, fail);
          };
          send();
        }, fail);
      });
    }
    /** Looks, in a quiet moment, at what the sharper image should be doing now, and does it. */
    function sharpLook(): void {
      sharpWait = null;
      if (!alive || lost || sharpAllowed === false) return;
      const s = useMapStore.getState();
      // Not before every first image this map loads is in: the sharper one never competes with them.
      const firstIn3 = settled === started.size && STOP_IDS.every((id) => store[id]);
      const could = firstIn3
        ? gasSharpWanted({ allowed: true, interactive: s.input.interactive, stop: s.input.stop, sliderT: s.sliderT, ppr: view.current.ppr, texelsPerRaw: images[s.input.stop].first, deep: view.current.deep })
        : null;
      const wanted = could !== null && sharpIsAllowed() ? could : null;
      const plan = gasSharpPlan(sharp.current?.stop ?? null, sharpLoading?.stop ?? null, wanted, gasRestingStop(s.input.stop, s.sliderT), s.input.interactive);
      if (plan.release) {
        // If it is on screen (the map became the backdrop of Home), one frame draws the first image in its place.
        const shown = sharp.current !== null && mesh.visible && stopsShown(s.sliderT).includes(sharp.current.stop);
        releaseSharp();
        if (shown) invalidate();
      }
      if (plan.cancel) cancelSharp();
      if (plan.start) startSharp(plan.start);
      sharpFlag();
    }
    /** Asks for a look at the next quiet moment (and not before a failed load may be tried again). Called after
     * every frame and every change of stop: one pending timer at most, and no frame is drawn by it. */
    function sharpPoke(): void {
      if (!alive || sharpWait !== null || sharpAllowed === false) return;
      sharpWait = whenQuiet(sharpLook, () => sharpNotBefore);
    }
    function dropSharp(): void {
      sharpWait?.cancel();
      sharpWait = null;
      cancelSharp();
      releaseSharp();
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
      if (s.input.stop !== prev.input.stop || s.sliderT !== prev.sliderT || s.input.interactive !== prev.input.interactive) sharpPoke();
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
      dropSharp();
      sharpFlag();
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
    const ENDS = ["pointerup", "pointercancel"] as const;
    for (const type of INPUTS) window.addEventListener(type, onInput, { capture: true, passive: true });
    for (const type of ENDS) window.addEventListener(type, onPointerEnd, { capture: true, passive: true });
    window.addEventListener("blur", onBlur);
    // The end of every drawn frame counts too (useFrame below stamps its start): a slow frame is not a quiet map.
    const offFrame = addAfterEffect(() => {
      frameAt.current = performance.now();
      sharpPoke();
    });
    sharpFlag();
    return () => {
      alive = false;
      setSharpFlag(undefined);
      offFrame();
      idle?.cancel();
      dropWaiting();
      dropSharp();
      for (const type of INPUTS) window.removeEventListener(type, onInput, { capture: true });
      for (const type of ENDS) window.removeEventListener(type, onPointerEnd, { capture: true });
      window.removeEventListener("blur", onBlur);
      unsubscribe();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      for (const stop of STOP_IDS) store[stop]?.dispose();
      loaded.current = {};
    };
  }, [enabled, gl, invalidate, mesh, noise, theme, images]);

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
    // The sharper image stands in for its stop's first image wherever that stop is bound, also as one end of a
    // morph, so nothing changes on screen when the slider starts to move.
    const sharper = sharp.current;
    const a = images[pair.a];
    const b = images[pair.b];
    const sharpA = sharper?.stop === pair.a;
    const sharpB = sharper?.stop === pair.b;
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    u.u_gasA.value = sharpA ? sharper!.texture : got[pair.a]!;
    u.u_gasB.value = sharpB ? sharper!.texture : got[pair.b]!;
    u.u_mix.value = pair.k;
    (u.u_rectA.value as THREE.Vector4).fromArray(a.rect);
    (u.u_rectB.value as THREE.Vector4).fromArray(b.rect);
    const texels = lerp(sharpA ? a.sharp : a.first, sharpB ? b.sharp : b.first, pair.k);
    u.u_bakePpr.value = texels;
    u.u_lodBias.value = gasLodBias(texels, theme.bakeHalf);
    u.u_octPpr.value = lerp(a.sharp, b.sharp, pair.k);

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
    view.current.ppr = u.u_ppr.value as number;
    view.current.deep = curve.deep;

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
