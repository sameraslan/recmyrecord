import { STOP_IDS, type StopId } from "@/lib/types";
import { isSoftwareRenderer } from "../state/renderer";
import { smoothstep } from "../state/zoomLimits";
import { NAMES_BAND_PX } from "../theme";

/**
 * The nebula gas behind the album points. Each slider stop's gas is baked at build time (npm run theme:
 * scripts/theme/) into public/data/theme/gas-<stop>.<hash>.webp, where rgb is the toned gas with no sky and no dust and
 * a is what the dust lets through. An image covers only the raw rectangle that holds the stop's gas (theme.json
 * `gas`); beyond it there is plain sky. A second, sharper image of the same rectangle (gas-<stop>-sharp.<hash>.webp,
 * the prototype's resolution) replaces the first on capable desktops, for the stop on screen only (gasSharpPlan).
 * This shader draws one quad in world space: it cross-fades two stops, applies the zoom band strength, the dust
 * and the pool around an open album, adds the fine octaves the bake could not hold, a soft glow from the bake's
 * mips, the sky and a little grain. In deep zoom (covers past 32 px) what is left of the gas is fainter, greyer,
 * smooth and out of focus. It has no clock.
 */

/** Longer side of a baked stop in px. WebGL2 guarantees textures this large. */
export const GAS_TEXTURE_PX = 2048;
/** No side of a sharper image is longer than this; a GPU with a smaller limit keeps the first image. */
export const GAS_SHARP_TEXTURE_PX = 4096;
/** The prototype bakes the whole square (2 bakeHalf raw units) at this many px. Mip levels are counted from it. */
export const GAS_REFERENCE_PX = 4096;
/** Cover sizes (CSS px) where the gas has yielded to 0.6 and to 0.3 of its strength; dust is gone by the first. */
export const GAS_BAND_MID_PX = 22;
export const GAS_BAND_COVERS_PX = 32;
/** Deep zoom (the prototype's DEEP): past GAS_BAND_COVERS_PX the gas goes on fading, from 0.3 to the floor at
 * this cover size, eased out, so full-size covers sit in near-black space. */
export const GAS_DEEP_END_PX = 56;
export const GAS_DEEP_FLOOR = 0.06;
/** Share of its colour the gas loses over the same stretch. */
export const GAS_DEEP_DESAT = 0.35;
/** Over the same stretch the gas is read more and more from a blurred copy of the bake: the mean of these two
 * mip levels of the prototype's bake (GAS_REFERENCE_PX over the whole square). An image with fewer texels per
 * raw unit reads lower levels by gasLodBias, so the blur is as wide on screen whichever image is bound. */
export const GAS_DEEP_LOD: [number, number] = [4.5, 6];
/** The quad is this many times the baked square, so sky and grain run on past anything the camera can show. */
export const GAS_QUAD_SCALE = 5;
/** Share of the blurred gas added back as glow. */
export const GAS_GLOW = 0.18;
/** Strength factor on Home, About and 404, where the map is a backdrop: 1, the gas as on the map (the approved Home
 * is the prototype's render, which has no such factor). The veil, the hero's pad and the scrims in CSS do the dimming
 * (styles/map.css, styles/home.css). */
export const GAS_DIMMED_STRENGTH = 1;
/** The pool around an open album's group: easing time, and its smallest radius on screen (CSS px). */
export const POOL_MS = 400;
export const POOL_MIN_PX = 170;
/** The empty sky as the shader writes it; rounds to SKY_RGB (../theme). */
export const GAS_SKY: [number, number, number] = [0.024, 0.022, 0.034];

/** Where a stop's image is. `hash` is theme.json's gas.<stop>.hash: the first 10 hex characters of the SHA-256
 * of the first image and of the sharper one. The name changes whenever the content does, so a browser's cached
 * copy (/data is cached for a day) can never be an image of another bake. */
export const gasUrl = (stop: StopId, hash: readonly [string, string], sharp = false): string =>
  `/data/theme/gas-${stop}${sharp ? "-sharp" : ""}.${hash[sharp ? 1 : 0]}.webp`;

/** True when a decoded image is the size theme.json says. Any other size is an image of another bake (or not
 * the image at all): drawn into this bake's rectangle it would put the gas beside the albums, so it is refused. */
export function gasImageFits(image: { width: number; height: number }, px: readonly [number, number]): boolean {
  return image.width === px[0] && image.height === px[1];
}

/** A raw rectangle [west, south, east, north] (theme.json `gas`). */
export type GasRect = readonly [number, number, number, number];

/** Texels per raw unit of an image `widthPx` wide over `rect`. */
export function gasTexelsPerRaw(rect: GasRect, widthPx: number): number {
  return widthPx / (rect[2] - rect[0]);
}

/** The shader's form of a rectangle: west edge, north edge, 1 / width, 1 / height (the image is stored upright,
 * so u runs east from the west edge and v runs south from the north edge). */
export function gasRectUniform(rect: GasRect): [number, number, number, number] {
  return [rect[0], rect[3], 1 / (rect[2] - rect[0]), 1 / (rect[3] - rect[1])];
}

/** Mip levels between an image with `texelsPerRaw` and the prototype's bake: 0 for the sharper image, about -0.8
 * for the first one. Added to GAS_DEEP_LOD. */
export function gasLodBias(texelsPerRaw: number, bakeHalf: number): number {
  return Math.log2((texelsPerRaw * 2 * bakeHalf) / GAS_REFERENCE_PX);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Gas strength for a cover size in CSS px, and how far into deep zoom the view is (0 to 1). A port of the
 * prototype's RMR.gasCurve with its default floor.
 * strength: 1 while region names show; a straight line to 0.6 at 22 px covers; a straight line to 0.3 at 32 px;
 * then 0.3 + (floor - 0.3) * e, with u = (coverPx - 32) / (56 - 32) clamped to 0..1 and e = 1 - (1 - u)^2.
 * deep: e. The shader applies strength as 1 - (1 - c)^strength and uses deep for colour, detail and focus.
 */
export function gasCurve(coverPx: number): { strength: number; deep: number } {
  if (coverPx < NAMES_BAND_PX) return { strength: 1, deep: 0 };
  if (coverPx < GAS_BAND_MID_PX) return { strength: lerp(1, 0.6, (coverPx - NAMES_BAND_PX) / (GAS_BAND_MID_PX - NAMES_BAND_PX)), deep: 0 };
  if (coverPx < GAS_BAND_COVERS_PX) return { strength: lerp(0.6, 0.3, (coverPx - GAS_BAND_MID_PX) / (GAS_BAND_COVERS_PX - GAS_BAND_MID_PX)), deep: 0 };
  const u = Math.min(1, Math.max(0, (coverPx - GAS_BAND_COVERS_PX) / (GAS_DEEP_END_PX - GAS_BAND_COVERS_PX)));
  const e = 1 - (1 - u) * (1 - u);
  return { strength: lerp(0.3, GAS_DEEP_FLOOR, e), deep: e };
}

/** How much of the dust shows: all of it at the overview, none once covers approach. */
export function gasDust(coverPx: number): number {
  return 1 - smoothstep(NAMES_BAND_PX, GAS_BAND_MID_PX, coverPx);
}

/** The two stops the slider is between and how far towards the second (the rule of album.ts interpolatePos). */
export function stopMix(t: number): { a: StopId; b: StopId; k: number } {
  return t <= 0.5 ? { a: "sonic", b: "balanced", k: t * 2 } : { a: "balanced", b: "mood", k: (t - 0.5) * 2 };
}

/** The stops whose gas shows at slider position t: one at a stop, two between stops. */
export function stopsShown(t: number): StopId[] {
  const m = stopMix(t);
  return m.k <= 0 ? [m.a] : m.k >= 1 ? [m.b] : [m.a, m.b];
}

/** Slider position of each stop (the same numbers as STOP_T in ../data, which stopMix is built on). */
const STOP_AT: Record<StopId, number> = { sonic: 0, balanced: 0.5, mood: 1 };

/** Every stop whose gas shows at some moment of a morph from slider position `fromT` to `toT`, in slider
 * order: Balanced to Mood never shows Sonic, Sonic to Mood passes through Balanced. */
export function stopsOnPath(fromT: number, toT: number): StopId[] {
  const lo = Math.min(fromT, toT);
  const hi = Math.max(fromT, toT);
  const ends = [...stopsShown(fromT), ...stopsShown(toT)];
  return STOP_IDS.filter((s) => ends.includes(s) || (STOP_AT[s] >= lo && STOP_AT[s] <= hi));
}

/**
 * The textures to bind at slider position t. At a stop it is one texture twice with k 0. When a needed stop has
 * not loaded yet, the nearer loaded stop of the pair stands in (then any loaded stop), so the gas never drops
 * out while the slider moves; null when nothing has loaded.
 */
export function gasPair(t: number, ready: Record<StopId, boolean>): { a: StopId; b: StopId; k: number } | null {
  const m = stopMix(t);
  if (ready[m.a] && ready[m.b]) {
    if (m.k >= 1) return { a: m.b, b: m.b, k: 0 };
    if (m.k <= 0) return { a: m.a, b: m.a, k: 0 };
    return m;
  }
  const near = m.k < 0.5 ? m.a : m.b;
  const far = near === m.a ? m.b : m.a;
  const pick = ready[near] ? near : ready[far] ? far : STOP_IDS.find((s) => ready[s]);
  return pick ? { a: pick, b: pick, k: 0 } : null;
}

/** Centre and radius of the dim pool around a focus group: the middle of the albums' box, 0.3 of its diagonal,
 * at least `minRadius`. `pos` is flat xy; ids outside it are skipped. null when no id is known. */
export function focusPool(pos: Float32Array, ids: readonly number[], minRadius: number): [number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of ids) {
    const x = pos[2 * i];
    const y = pos[2 * i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (x0 === Infinity) return null;
  return [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(Math.hypot(x1 - x0, y1 - y0) * 0.3, minRadius)];
}

/**
 * The stops whose gas a map starts loading, the one on screen first. The dimmed backdrop of Home, About and 404
 * takes no input and cannot reach another stop, so it starts only the stop it shows. An interactive map also
 * starts the other two, which GasField fetches at idle priority.
 */
export function gasStopsToStart(current: StopId, interactive: boolean): StopId[] {
  return interactive ? [current, ...STOP_IDS.filter((s) => s !== current)] : [current];
}

/** A gas image that is not needed on screen is uploaded only once the map has been left alone this long. */
export const GAS_UPLOAD_QUIET_MS = 250;
/** Two uploads are at least this far apart (two frames at 60 a second), so they never share a frame. */
export const GAS_UPLOAD_GAP_MS = 34;
/** A visitor whose pointer never rests would never get the late images. After this long an image stops waiting
 * for a quiet map and goes in at the next idle moment between input events (one image, then the clock restarts).
 * Never inside a gesture: while a pointer is down or a wheel or pinch zoom is running nothing is uploaded, however
 * long it lasts, and the clock starts again when the gesture ends (gasUploadOverdue). */
export const GAS_UPLOAD_MAX_WAIT_MS = 4000;
/** How long an image that is needed on screen waits for the GPU to finish the frames already asked of it: the
 * first image of a map (nothing is on screen yet, and a software renderer needs a few hundred ms for the map's
 * first frame), and any later one (a morph is running and must not show the stand-in for long). */
export const GAS_FIRST_UPLOAD_CAP_MS = 1500;
export const GAS_BUSY_UPLOAD_CAP_MS = 100;

/** True when the map has issued a frame since a GPU fence was asked for at `fenceAt`: the fence then says nothing
 * about that frame, and an upload behind it would block the main thread until the frame is drawn (the map's whole
 * first frame on a software renderer, 300 ms measured). A new fence is asked for instead. */
export function gasFenceStale(fenceAt: number, lastFrame: number): boolean {
  return lastFrame >= fenceAt;
}

/** True while the visitor has hold of the map: a pointer is down (a drag, or a pinch with two fingers), or a
 * wheel event (a wheel zoom, or a pinch on a trackpad, which arrives as wheel events) came within the last
 * GAS_UPLOAD_QUIET_MS. */
export function gasGestureActive(now: number, pointersDown: number, lastWheel: number): boolean {
  return pointersDown > 0 || now - lastWheel < GAS_UPLOAD_QUIET_MS;
}

/** When no pointer event of any kind (down, move, up, cancel, from any pointer) has been seen for this long, the
 * pointers that went down are no longer taken to be held. The browser owes a pointerup or a pointercancel for
 * every pointerdown, but if both are ever lost for a finger or a pen (a mouse heals itself: GasField drops it on
 * a move with no button), "held" would last until the window lost focus and the late images would never be
 * uploaded. Five seconds is ten times a long press (recognised after about half a second) and longer than anyone
 * rests a pointer dead still on purpose in the middle of a drag. A pointer that really is held still for longer
 * gets at most the waiting uploads, while nothing on the map moves, and counts as held again with its next move
 * (GasField: a move with a button or a finger down). */
export const GAS_HELD_LAPSE_MS = 5000;

/** True when the pointers that are down may no longer be taken to be held: `lastPointerEvent` is when the last
 * pointer event of any kind was seen. */
export function gasHeldLapsed(now: number, lastPointerEvent: number): boolean {
  return now - lastPointerEvent >= GAS_HELD_LAPSE_MS;
}

/** True when an image has waited for a quiet map since `since` for as long as it may. `lastGesture` is when the
 * last gesture ended, or `now` while one is running (gasGestureActive): the wait starts again from there, so the
 * cap never puts an upload inside a drag or a zoom, nor into the moment one ends. */
export function gasUploadOverdue(now: number, since: number, lastGesture = -Infinity): boolean {
  return now - Math.max(since, lastGesture) >= GAS_UPLOAD_MAX_WAIT_MS;
}

/**
 * How long (ms) the upload of a gas image that is not on screen must still wait: until GAS_UPLOAD_QUIET_MS have
 * passed since the last pointer, wheel or key input and since the last frame the map drew, and never while a
 * gesture is running (`gesture`, gasGestureActive: a finger or a button held still on the map draws nothing and
 * sends nothing, and is still not a quiet map). 0 means now. The upload and its mip build run on the main thread
 * (about 10 ms on a GPU, a few hundred on a software renderer), so they must not land inside a pan, a zoom, a
 * hover or a camera move.
 */
export function gasUploadWait(now: number, lastInput: number, lastFrame: number, gesture = false): number {
  if (gesture) return GAS_UPLOAD_QUIET_MS;
  return Math.max(0, Math.max(lastInput, lastFrame) + GAS_UPLOAD_QUIET_MS - now);
}

/** A device that reports less memory than this (GB) keeps the first image. Chrome reports at most 8. */
export const GAS_SHARP_MIN_MEMORY_GB = 8;

/** What gasSharpBlocked is told about the device. */
export interface GasSharpDevice {
  /** The GPU's largest texture side. */
  maxTextureSize: number;
  /** `(pointer: fine)`: the primary pointer is a mouse or a trackpad, not a finger. */
  finePointer: boolean;
  /** `(hover: hover)`: the primary pointer can rest over things without pressing them. */
  canHover: boolean;
  /** The renderer's name (WEBGL_debug_renderer_info), or "" when it is not known or not to be judged. */
  renderer: string;
  /** navigator.deviceMemory in GB, where the browser reports it (Chrome does; Safari and Firefox do not). */
  deviceMemory?: number;
  /** navigator.connection.saveData. */
  saveData?: boolean;
}

/**
 * Why the sharper image may not be used on this device, or null when it may. It is for ordinary desktops and
 * laptops and nothing else. The rule, all of it:
 *   1. the GPU takes textures of GAS_SHARP_TEXTURE_PX (4096) px;
 *   2. the primary pointer is fine (a mouse or a trackpad, not a finger) AND it can hover: `(pointer: fine)` and
 *      `(hover: hover)`. A phone or a tablet answers coarse and no hover and is left out. A laptop with a touch
 *      screen answers fine and hover (its primary pointer is the trackpad) and gets the sharper image; whether the
 *      device also has a touch screen is not asked. A tablet used with a mouse or a trackpad cover may answer the
 *      same as that laptop; rule 4 is what then stands between it and the sharper image, where the browser
 *      reports memory;
 *   3. the renderer is a real GPU, not a software one (which would pay for the upload and show no more);
 *   4. where the browser reports the device's memory, it is at least GAS_SHARP_MIN_MEMORY_GB (8). A browser that
 *      does not report it passes this test;
 *   5. the visitor has not asked to save data.
 * Everything else keeps the first image: fewer CSS px per texel on a phone, and a third of the GPU memory.
 */
export function gasSharpBlocked(d: GasSharpDevice): string | null {
  if (d.maxTextureSize < GAS_SHARP_TEXTURE_PX) return "textures too small";
  if (!d.finePointer || !d.canHover) return "touch device";
  if (gasSoftwareRenderer(d.renderer)) return "software renderer";
  if (d.deviceMemory !== undefined && d.deviceMemory < GAS_SHARP_MIN_MEMORY_GB) return "little memory";
  if (d.saveData) return "save data";
  return null;
}

/** True when the renderer's name is a software renderer's: the CPU shades every pixel. The test itself is
 * state/renderer.ts isSoftwareRenderer, shared with the star glints. */
export const gasSoftwareRenderer = isSoftwareRenderer;

/**
 * The stop whose sharper image the view could use right now, or null: only on an interactive map, only while
 * the slider rests at a stop, only when the screen shows more px per raw unit than the first image has texels
 * (else the first image is already as sharp as the screen), and not at full deep zoom, where the gas is read
 * from a blurred copy.
 */
export function gasSharpWanted(v: { allowed: boolean; interactive: boolean; stop: StopId; sliderT: number; ppr: number; texelsPerRaw: number; deep: number }): StopId | null {
  if (!v.allowed || !v.interactive || v.sliderT !== STOP_AT[v.stop]) return null;
  return v.ppr > v.texelsPerRaw && v.deep < 1 ? v.stop : null;
}

/** The stop the slider rests at, or null while it is between stops or on its way to another. */
export function gasRestingStop(stop: StopId, sliderT: number): StopId | null {
  return sliderT === STOP_AT[stop] ? stop : null;
}

/**
 * What to do about the sharper image. At most one exists at a time (it is as large as the three first images
 * together): `have` is the stop whose sharper image is on the GPU, `loading` the stop whose is on its way.
 * release: free `have`. It is kept through a morph (the fade starts from it) and through any zoom, and freed
 * once the slider rests at another stop or the map stops being interactive.
 * cancel: drop `loading`, by the same rule.
 * start: begin loading this stop's. Never while another is held or loading, unless that one goes in this step,
 * so two never share the GPU.
 */
export function gasSharpPlan(have: StopId | null, loading: StopId | null, wanted: StopId | null, resting: StopId | null, interactive: boolean): { release: boolean; cancel: boolean; start: StopId | null } {
  const gone = (s: StopId | null): boolean => s !== null && (!interactive || (resting !== null && resting !== s));
  const release = gone(have);
  const cancel = gone(loading);
  const free = (have === null || release) && (loading === null || cancel);
  const start = wanted !== null && wanted !== have && wanted !== loading && free ? wanted : null;
  return { release, cancel, start };
}

/** When the sharper image is in, the picture goes from the first image to it over this long, eased, so the
 * detail arrives as a short focus pull and not as a snap in one frame. */
export const GAS_SHARP_FADE_MS = 200;

/**
 * How much of the sharper image shows `now - start` ms after it came in: 0 at the start, eased (smoothstep), and
 * exactly 1 from GAS_SHARP_FADE_MS on. GasField draws frames only while this is under 1, binds the two images
 * of the stop as the shader's A and B with this as the mix, and from 1 on binds the sharper image alone again
 * (mix 0, one read). There is no clock at rest: the value is worked out in frames the fade itself asked for.
 */
export function gasSharpFade(now: number, start: number): number {
  const t = (now - start) / GAS_SHARP_FADE_MS;
  if (!(t < 1)) return 1; // also when the clock is not a number
  if (t <= 0) return 0;
  return t * t * (3 - 2 * t);
}

/** A sharper image that fails to load (the network dropped it, or it is not the image theme.json describes) is
 * asked for once more, at a quiet moment at least GAS_SHARP_RETRY_MS later. After the second failure it is not
 * asked for again on this map, and the first image stays. */
export const GAS_SHARP_TRIES = 2;
export const GAS_SHARP_RETRY_MS = 2000;

/** How long to wait before asking again after `fails` failed loads, or null to give up. */
export function gasSharpRetry(fails: number): number | null {
  return fails < GAS_SHARP_TRIES ? GAS_SHARP_RETRY_MS : null;
}

/** The sharper image goes to the GPU in this many horizontal strips, one per quiet moment, so no single upload
 * is long enough to be felt if the visitor moves the map the same instant. */
export const GAS_SHARP_STRIPS = 16;

/** Row ranges [from, to) of the strips of an image `height` px tall. */
export function gasSharpStrips(height: number, strips = GAS_SHARP_STRIPS): [number, number][] {
  const n = Math.max(1, Math.min(strips, height));
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) out.push([Math.floor((i * height) / n), Math.floor(((i + 1) * height) / n)]);
  return out;
}

/** A smaller limit would make three resize the bake through a 2D canvas, which multiplies the dust channel into
 * the colour. Then there is no gas (plain sky). */
export function gasTextureFits(maxTextureSize: number): boolean {
  return maxTextureSize >= GAS_TEXTURE_PX;
}

/** The seeded 256 x 256 random table the bake was shaded with (mulberry32, seed 7): grain and fine octaves. */
export function gasNoise(): Uint8Array {
  let a = 7;
  const rnd = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const table = new Uint8Array(256 * 256);
  for (let i = 0; i < table.length; i++) table[i] = Math.floor(rnd() * 256);
  return table;
}

const f = (v: number) => v.toFixed(4);

export const GAS_VERTEX_SHADER = /* glsl */ `
  uniform vec3 u_tx;         // raw centre x, y and scale: world = (raw - centre) * scale
  uniform float u_quadHalf;  // half size of the quad in raw units

  varying vec2 v_raw;

  void main() {
    v_raw = position.xy * u_quadHalf;
    vec2 world = (v_raw - u_tx.xy) * u_tx.z;
    // Behind the album points (z 0 to 0.4). The material neither tests nor writes depth.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, -1.0, 1.0);
  }
`;

export const GAS_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D u_gasA;   // baked stop: rgb = toned gas, a = what the dust lets through
  uniform sampler2D u_gasB;   // the stop the slider is moving towards
  uniform sampler2D u_noise;  // 256 px random table (gasNoise)
  uniform float u_mix;        // 0 = only A
  uniform float u_ppr;        // CSS px per raw unit on screen
  uniform float u_bakePpr;    // texels per raw unit of the image on screen
  uniform float u_octPpr;     // texels per raw unit the bake's noise octaves were faded for (the sharper image's)
  uniform float u_lodBias;    // mip levels from the prototype's bake to the image on screen (gasLodBias)
  uniform vec4 u_rectA;       // raw rectangle of image A: west edge, north edge, 1 / width, 1 / height
  uniform vec4 u_rectB;       // the same for image B
  uniform float u_strength;   // zoom band times the dim of Home and About
  uniform float u_deep;       // 0 to 1: how far into deep zoom the view is (gasCurve)
  uniform float u_dust;       // 1 at the overview, 0 once covers approach
  uniform float u_poolAmt;    // 0 to 1, eased while an album opens or closes
  uniform vec3 u_pool;        // raw centre x, y and radius of the pool around an open album's group

  varying vec2 v_raw;

  const vec3 SKY = vec3(${GAS_SKY.map(f).join(", ")});
  const float GLOW = ${f(GAS_GLOW)};
  const float DEEP_DESAT = ${f(GAS_DEEP_DESAT)};
  const float DEEP_LOD_A = ${f(GAS_DEEP_LOD[0])};
  const float DEEP_LOD_B = ${f(GAS_DEEP_LOD[1])};

  vec2 g_uvA;
  vec2 g_uvB;
  float g_skyA; // 0 inside image A, 1 at and beyond its edge
  float g_skyB;

  float sm(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // Value noise from the random table; the smoothstep fraction makes LINEAR filtering do the interpolation.
  float vn(vec2 p) {
    vec2 i = floor(p);
    vec2 fr = fract(p);
    fr = fr * fr * (3.0 - 2.0 * fr);
    return texture2D(u_noise, (i + fr + 0.5) / 256.0).r;
  }

  // The image is stored upright: row 0 is the north edge of its rectangle.
  vec2 uvIn(vec4 r) {
    return vec2((v_raw.x - r.x) * r.z, (r.y - v_raw.y) * r.w);
  }

  // Beyond an image's rectangle there is no gas: plain sky, no dust. The outer fiftieth of an image is empty
  // padding (the bake checks it), and whatever a lossy encode left there, a level of 255 at most, is faded out
  // across it, so the gas ends with no step.
  // (Worked out once per pixel and image, not once per read.)
  float skyAt(vec2 uv) {
    return sm(0.48, 0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
  }

  vec4 inBake(vec4 t, float sky) {
    return mix(t, vec4(0.0, 0.0, 0.0, 1.0), sky);
  }

  vec4 gas() {
    vec4 t = inBake(texture2D(u_gasA, clamp(g_uvA, 0.0, 1.0)), g_skyA);
    if (u_mix > 0.0) t = mix(t, inBake(texture2D(u_gasB, clamp(g_uvB, 0.0, 1.0)), g_skyB), u_mix);
    return t;
  }

  vec4 gasLod(float lod) {
    vec4 t = inBake(textureLod(u_gasA, clamp(g_uvA, 0.0, 1.0), lod), g_skyA);
    if (u_mix > 0.0) t = mix(t, inBake(textureLod(u_gasB, clamp(g_uvB, 0.0, 1.0), lod), g_skyB), u_mix);
    return t;
  }

  // The bake's tone map is 1 - exp(-EX * light), so scaling the light by k afterwards is 1 - (1 - c)^k. The zoom
  // band strength, the dust (which fades out with zoom) and the pool all act on the light this way.
  vec3 lit(vec4 t, float k) {
    return 1.0 - pow(max(1.0 - t.rgb, vec3(0.002)), vec3(k * mix(1.0, t.a, u_dust)));
  }

  void main() {
    g_uvA = uvIn(u_rectA);
    g_skyA = skyAt(g_uvA);
    if (u_mix > 0.0) {
      g_uvB = uvIn(u_rectB);
      g_skyB = skyAt(g_uvB);
    }

    float k = u_strength;
    float des = 0.0;
    if (u_poolAmt > 0.0) {
      vec2 dd = (v_raw - u_pool.xy) / u_pool.z;
      float e = exp(-dot(dd, dd) * 0.5);
      k *= mix(1.0, mix(0.6, 0.25, e), u_poolAmt);
      des = 0.5 * e * u_poolAmt;
    }

    vec4 t = gas();
    // Past the resolution the bake was shaded for, world-anchored noise octaves (the ones the bake left out) keep
    // the gas textured, exactly as the prototype adds them past its own bake. Both images of a stop hold the same
    // octaves (the first is the sharper one resampled), so this starts at the same zoom for both: nothing at
    // Overview, a trace beside an open album. They are plain value noise, not shaped by the flow, so they must
    // never stand in for swirl the image is too small to carry; where the first image is magnified the gas is
    // softer instead. They fade out in deep zoom, where the faint gas that is left must be smooth, and are not
    // read at all once deep zoom is complete (their weight is 0 there).
    if (u_ppr > u_octPpr && u_deep < 1.0) {
      vec2 p = vec2(v_raw.x * 5.0 + 20.0, -v_raw.y * 5.0 + 20.0) * 1.25;
      float d = 0.0;
      float a = 0.0778;
      float fq = 38.0;
      for (int i = 5; i < 9; i++) {
        float have = sm(1.5, 4.0, u_octPpr / (6.25 * fq));
        float want = sm(1.5, 4.0, u_ppr / (6.25 * fq));
        if (want > have) d += a * (want - have) * (vn(p * fq + vec2(17.3, 9.1) * float(i)) - 0.5);
        a *= 0.6;
        fq *= 2.07;
      }
      t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);
    }
    // Deep zoom: the gas goes out of focus as it fades (a blurred copy, the mean of two mip levels), so there are
    // no blotches and no detail behind full-size covers.
    float deepA = DEEP_LOD_A + u_lodBias;
    float deepB = DEEP_LOD_B + u_lodBias;
    if (u_deep > 0.0) t = mix(t, 0.5 * (gasLod(deepA) + gasLod(deepB)), u_deep);
    vec3 c = lit(t, k);

    // Glow: the same gas about 11 and 32 CSS px wide, read from the bake's mips (level 0 is one texel per
    // 1 / u_bakePpr raw units, the screen shows u_ppr px per raw unit). In deep zoom it is never sharper than
    // the blurred copy above.
    float lod = log2(max(u_bakePpr / max(u_ppr, 1.0), 0.0001));
    vec3 g = lit(gasLod(max(lod + 3.5, deepA * u_deep)), k) * 0.6 + lit(gasLod(max(lod + 5.0, deepB * u_deep)), k) * 0.4;
    c += g * GLOW;

    // The pool takes half the colour at its centre and deep zoom takes DEEP_DESAT of it; the two combine.
    des = 1.0 - (1.0 - des) * (1.0 - DEEP_DESAT * u_deep);
    c = mix(c, vec3((c.r + c.g + c.b) / 3.0), des);
    float n = (texelFetch(u_noise, ivec2(gl_FragCoord.xy) & 255, 0).r - 0.5) * 0.012;
    // Colours are authored in sRGB and written straight to the framebuffer (see canvas/Scene.tsx onCreated).
    gl_FragColor = vec4(SKY + c + n, 1.0);
  }
`;

/**
 * The lighter gas for software renderers only (gasSoftwareRenderer), where the CPU shades every pixel of every
 * frame and the full shader made frame gaps longer than the site had before the gas. It keeps what shows the
 * nebula and drops what costs reads: one read of the image at a stop and two between stops (at the mip level of
 * the screen's resolution, u_liteLod, a fraction worked out once per frame and read with the texture's own
 * trilinear filter), no glow reads (the glow's light is added from the same read), no noise octaves and no grain.
 * The zoom bands, the dust, the pool, the deep zoom fade and its loss of colour are the full shader's. In deep
 * zoom the gas also loses its detail and goes out of focus as in the full shader, by the same one read: its mip
 * level rises with u_deep to the full shader's blurred copy (gasLiteLod), so there is no second read for it.
 */
export const GAS_FRAGMENT_SHADER_LITE = /* glsl */ `
  precision highp float;

  uniform sampler2D u_gasA;
  uniform sampler2D u_gasB;
  uniform float u_mix;
  uniform float u_liteLod;    // the mip level to read: the screen's resolution, rising in deep zoom (gasLiteLod)
  uniform vec4 u_rectA;
  uniform vec4 u_rectB;
  uniform float u_strength;
  uniform float u_deep;
  uniform float u_dust;
  uniform float u_poolAmt;
  uniform vec3 u_pool;

  varying vec2 v_raw;

  const vec3 SKY = vec3(${GAS_SKY.map(f).join(", ")});
  const float GLOW = ${f(GAS_GLOW)};
  const float DEEP_DESAT = ${f(GAS_DEEP_DESAT)};

  float sm(float a, float b, float x) {
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // One read of an image over its rectangle (stored upright, north at the top), ending in plain sky at its edge.
  vec4 bake(sampler2D image, vec4 r) {
    vec2 uv = vec2((v_raw.x - r.x) * r.z, (r.y - v_raw.y) * r.w);
    float sky = sm(0.48, 0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
    return mix(textureLod(image, clamp(uv, 0.0, 1.0), u_liteLod), vec4(0.0, 0.0, 0.0, 1.0), sky);
  }

  void main() {
    float k = u_strength;
    float des = 0.0;
    if (u_poolAmt > 0.0) {
      vec2 dd = (v_raw - u_pool.xy) / u_pool.z;
      float e = exp(-dot(dd, dd) * 0.5);
      k *= mix(1.0, mix(0.6, 0.25, e), u_poolAmt);
      des = 0.5 * e * u_poolAmt;
    }
    vec4 t = bake(u_gasA, u_rectA);
    if (u_mix > 0.0) t = mix(t, bake(u_gasB, u_rectB), u_mix);
    // the light as the full shader works it out, with the glow's share added from the same read
    vec3 c = (1.0 - pow(max(1.0 - t.rgb, vec3(0.002)), vec3(k * mix(1.0, t.a, u_dust)))) * (1.0 + GLOW);
    des = 1.0 - (1.0 - des) * (1.0 - DEEP_DESAT * u_deep);
    if (des > 0.0) c = mix(c, vec3((c.r + c.g + c.b) / 3.0), des);
    gl_FragColor = vec4(SKY + c, 1.0);
  }
`;

/** The source GasField compiles: the lighter shader when the material defines GAS_LITE, else the full one, whose
 * text is GAS_FRAGMENT_SHADER unchanged, so a GPU compiles exactly what it did before the lighter one existed. */
export const GAS_FRAGMENT_SOURCE = `#ifdef GAS_LITE\n${GAS_FRAGMENT_SHADER_LITE}\n#else\n${GAS_FRAGMENT_SHADER}\n#endif\n`;

/**
 * The mip level the lighter shader reads, as a fraction (the image's filter is trilinear, so the one read blends
 * the two levels around it and the sharpness never changes in a step while the map zooms).
 * Out of deep zoom it is the level with one texel per device px, never under 0: `texelsPerRaw` is the image's,
 * `pxPerRaw` the screen's in CSS px. In deep zoom it rises with `deep` (gasCurve, 0 to 1) to the middle of the two
 * levels the full shader blurs to (GAS_DEEP_LOD, moved by `lodBias`, gasLodBias of the image), so the gas loses
 * its detail and its focus on the same ease as its strength and colour, at no extra read. Never lower for a
 * larger `deep`.
 */
export function gasLiteLod(texelsPerRaw: number, pxPerRaw: number, dpr: number, deep = 0, lodBias = 0): number {
  const screen = Math.log2(texelsPerRaw / Math.max(pxPerRaw * dpr, 1e-6));
  const base = Number.isFinite(screen) ? Math.max(0, screen) : 0;
  const blurred = Math.max(base, (GAS_DEEP_LOD[0] + GAS_DEEP_LOD[1]) / 2 + (Number.isFinite(lodBias) ? lodBias : 0));
  const k = Number.isFinite(deep) ? Math.min(1, Math.max(0, deep)) : 0;
  return base + (blurred - base) * k;
}
