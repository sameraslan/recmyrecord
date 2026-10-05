import { STOP_IDS, type StopId } from "@/lib/types";
import { smoothstep } from "../state/zoomLimits";
import { NAMES_BAND_PX } from "../theme";

/**
 * The nebula gas behind the album points. Each slider stop's gas is baked at build time (npm run theme:
 * scripts/theme/) into public/data/theme/gas-<stop>.webp, where rgb is the toned gas with no sky and no dust and
 * a is what the dust lets through. This shader draws one quad in world space: it cross-fades two stops, applies
 * the zoom band strength, the dust and the pool around an open album, adds the fine octaves the bake could not
 * hold, a soft glow from the bake's mips, the sky and a little grain. In deep zoom (covers past 32 px) what is
 * left of the gas is fainter, greyer, smooth and out of focus. It has no clock.
 */

/** Edge of a baked stop in px. WebGL2 guarantees textures this large. */
export const GAS_TEXTURE_PX = 2048;
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
 * mip levels. The prototype uses 4.5 and 6 on a 4096 px bake of the same square; a 2048 px bake is one level lower. */
export const GAS_DEEP_LOD: [number, number] = [3.5, 5];
/** The quad is this many times the baked square, so sky and grain run on past anything the camera can show. */
export const GAS_QUAD_SCALE = 5;
/** Share of the blurred gas added back as glow. */
export const GAS_GLOW = 0.18;
/** Strength factor on Home, About and 404, where the map is a backdrop. */
export const GAS_DIMMED_STRENGTH = 0.6;
/** The pool around an open album's group: easing time, and its smallest radius on screen (CSS px). */
export const POOL_MS = 400;
export const POOL_MIN_PX = 170;
/** The empty sky as the shader writes it; rounds to SKY_RGB (../theme). */
export const GAS_SKY: [number, number, number] = [0.024, 0.022, 0.034];

export const gasUrl = (stop: StopId): string => `/data/theme/gas-${stop}.webp`;

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

/**
 * How long (ms) the upload of a gas image that is not on screen must still wait: until GAS_UPLOAD_QUIET_MS have
 * passed since the last pointer, wheel or key input and since the last frame the map drew. 0 means now. The
 * upload and its mip build run on the main thread (about 10 ms on a GPU, a few hundred on a software renderer),
 * so they must not land inside a pan, a zoom, a hover or a camera move.
 */
export function gasUploadWait(now: number, lastInput: number, lastFrame: number): number {
  return Math.max(0, Math.max(lastInput, lastFrame) + GAS_UPLOAD_QUIET_MS - now);
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
  uniform float u_bakePpr;    // texels per raw unit in the bake
  uniform float u_bakeHalf;   // the bake covers raw -half to half on both axes
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

  // Beyond the bake there is no gas: plain sky, no dust.
  vec4 inBake(vec4 t, vec2 uv) {
    float e = step(0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));
    return mix(t, vec4(0.0, 0.0, 0.0, 1.0), e);
  }

  vec4 gas(vec2 uv) {
    vec2 c = clamp(uv, 0.0, 1.0);
    vec4 t = texture2D(u_gasA, c);
    if (u_mix > 0.0) t = mix(t, texture2D(u_gasB, c), u_mix);
    return inBake(t, uv);
  }

  vec4 gasLod(vec2 uv, float lod) {
    vec2 c = clamp(uv, 0.0, 1.0);
    vec4 t = textureLod(u_gasA, c, lod);
    if (u_mix > 0.0) t = mix(t, textureLod(u_gasB, c, lod), u_mix);
    return inBake(t, uv);
  }

  // The bake's tone map is 1 - exp(-EX * light), so scaling the light by k afterwards is 1 - (1 - c)^k. The zoom
  // band strength, the dust (which fades out with zoom) and the pool all act on the light this way.
  vec3 lit(vec4 t, float k) {
    return 1.0 - pow(max(1.0 - t.rgb, vec3(0.002)), vec3(k * mix(1.0, t.a, u_dust)));
  }

  void main() {
    // The image is stored upright: row 0 is the north edge.
    vec2 uv = vec2(v_raw.x + u_bakeHalf, u_bakeHalf - v_raw.y) / (2.0 * u_bakeHalf);

    float k = u_strength;
    float des = 0.0;
    if (u_poolAmt > 0.0) {
      vec2 dd = (v_raw - u_pool.xy) / u_pool.z;
      float e = exp(-dot(dd, dd) * 0.5);
      k *= mix(1.0, mix(0.6, 0.25, e), u_poolAmt);
      des = 0.5 * e * u_poolAmt;
    }

    vec4 t = gas(uv);
    // Past the bake's resolution, world-anchored noise octaves (the ones the bake could not hold) keep the gas
    // textured. They fade out in deep zoom, where the faint gas that is left must be smooth, and are not read
    // at all once deep zoom is complete (their weight is 0 there).
    if (u_ppr > u_bakePpr && u_deep < 1.0) {
      vec2 p = vec2(v_raw.x * 5.0 + 20.0, -v_raw.y * 5.0 + 20.0) * 1.25;
      float d = 0.0;
      float a = 0.0778;
      float fq = 38.0;
      for (int i = 5; i < 9; i++) {
        float have = sm(1.5, 4.0, u_bakePpr / (6.25 * fq));
        float want = sm(1.5, 4.0, u_ppr / (6.25 * fq));
        if (want > have) d += a * (want - have) * (vn(p * fq + vec2(17.3, 9.1) * float(i)) - 0.5);
        a *= 0.6;
        fq *= 2.07;
      }
      t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);
    }
    // Deep zoom: the gas goes out of focus as it fades (a blurred copy, the mean of two mip levels), so there are
    // no blotches and no detail behind full-size covers.
    if (u_deep > 0.0) t = mix(t, 0.5 * (gasLod(uv, DEEP_LOD_A) + gasLod(uv, DEEP_LOD_B)), u_deep);
    vec3 c = lit(t, k);

    // Glow: the same gas about 11 and 32 CSS px wide, read from the bake's mips (level 0 is one texel per
    // 1 / u_bakePpr raw units, the screen shows u_ppr px per raw unit). In deep zoom it is never sharper than
    // the blurred copy above.
    float lod = log2(max(u_bakePpr / max(u_ppr, 1.0), 0.0001));
    vec3 g = lit(gasLod(uv, max(lod + 3.5, DEEP_LOD_A * u_deep)), k) * 0.6 + lit(gasLod(uv, max(lod + 5.0, DEEP_LOD_B * u_deep)), k) * 0.4;
    c += g * GLOW;

    // The pool takes half the colour at its centre and deep zoom takes DEEP_DESAT of it; the two combine.
    des = 1.0 - (1.0 - des) * (1.0 - DEEP_DESAT * u_deep);
    c = mix(c, vec3((c.r + c.g + c.b) / 3.0), des);
    float n = (texelFetch(u_noise, ivec2(gl_FragCoord.xy) & 255, 0).r - 0.5) * 0.012;
    // Colours are authored in sRGB and written straight to the framebuffer (see canvas/Scene.tsx onCreated).
    gl_FragColor = vec4(SKY + c + n, 1.0);
  }
`;
