import { describe, expect, it } from "vitest";

import { EMBER_RGB, FRAME_RGB, GAS_LUM_MAX, NAMES_BAND_PX, NEUTRAL_RGB, SKY_RGB, STAR_WHITE } from "../theme";
import {
  GAS_BAND_COVERS_PX,
  GAS_BAND_MID_PX,
  GAS_DEEP_DESAT,
  GAS_DEEP_END_PX,
  GAS_DEEP_FLOOR,
  GAS_DEEP_LOD,
  GAS_DIMMED_STRENGTH,
  GAS_FRAGMENT_SHADER,
  GAS_GLOW,
  GAS_SKY,
  GAS_TEXTURE_PX,
  GAS_VERTEX_SHADER,
  focusPool,
  gasCurve,
  gasDust,
  gasNoise,
  gasPair,
  GAS_BUSY_UPLOAD_CAP_MS,
  GAS_FIRST_UPLOAD_CAP_MS,
  GAS_UPLOAD_GAP_MS,
  GAS_UPLOAD_MAX_WAIT_MS,
  GAS_UPLOAD_QUIET_MS,
  gasStopsToStart,
  gasUploadOverdue,
  gasUploadWait,
  gasTextureFits,
  gasUrl,
  stopMix,
  stopsOnPath,
  stopsShown,
} from "./gas";

const ALL = { sonic: true, balanced: true, mood: true };

describe("theme constants the three parts share", () => {
  it("are the chosen Ember palette, sky and bands", () => {
    expect(SKY_RGB).toEqual([6, 6, 9]);
    expect(EMBER_RGB).toEqual([[232, 96, 60], [244, 190, 120], [150, 200, 214], [66, 110, 190], [120, 140, 220]]);
    expect(NEUTRAL_RGB).toEqual([138, 138, 146]);
    expect(STAR_WHITE).toEqual([255, 250, 244]);
    expect(FRAME_RGB).toEqual([241, 236, 228]);
    expect(NAMES_BAND_PX).toBe(13);
    expect(GAS_LUM_MAX).toBe(0.6);
  });

  it("give the shader the same sky as the CSS pane", () => {
    expect(GAS_SKY.map((v) => Math.round(v * 255))).toEqual(SKY_RGB);
    expect(GAS_FRAGMENT_SHADER).toContain("const vec3 SKY = vec3(0.0240, 0.0220, 0.0340);");
  });
});

describe("gasCurve and gasDust (zoom bands by cover size)", () => {
  it("has the prototype's bands and deep zoom numbers", () => {
    expect([NAMES_BAND_PX, GAS_BAND_MID_PX, GAS_BAND_COVERS_PX, GAS_DEEP_END_PX]).toEqual([13, 22, 32, 56]);
    expect(GAS_DEEP_FLOOR).toBe(0.06);
    expect(GAS_DEEP_DESAT).toBe(0.35);
    // the prototype's mip levels 4.5 and 6 on its 4096 px bake are one level lower on a 2048 px bake
    expect(GAS_DEEP_LOD).toEqual([4.5 - Math.log2(4096 / GAS_TEXTURE_PX), 6 - Math.log2(4096 / GAS_TEXTURE_PX)]);
    expect(GAS_DEEP_LOD).toEqual([3.5, 5]);
  });

  it("keeps the gas at full strength while names show, then yields to the covers", () => {
    expect(gasCurve(5)).toEqual({ strength: 1, deep: 0 });
    expect(gasCurve(12.99)).toEqual({ strength: 1, deep: 0 });
    expect(gasCurve(17.5).strength).toBeCloseTo(0.8, 10);
    expect(gasCurve(22).strength).toBeCloseTo(0.6, 10);
    expect(gasCurve(27).strength).toBeCloseTo(0.45, 10);
    expect(gasCurve(31.99).strength).toBeCloseTo(0.3003, 10);
    for (const px of [17.5, 22, 27, 31.99]) expect(gasCurve(px).deep, String(px)).toBe(0);
  });

  it("past 32 px covers fades on to the faint floor at 56 px, eased out, with no step at 32", () => {
    expect(gasCurve(32)).toEqual({ strength: 0.3, deep: 0 });
    expect(gasCurve(38).strength).toBeCloseTo(0.195, 10);
    expect(gasCurve(38).deep).toBeCloseTo(0.4375, 10);
    expect(gasCurve(44).strength).toBeCloseTo(0.12, 10);
    expect(gasCurve(44).deep).toBeCloseTo(0.75, 10);
    expect(gasCurve(50).strength).toBeCloseTo(0.075, 10);
    expect(gasCurve(50).deep).toBeCloseTo(0.9375, 10);
    expect(gasCurve(56)).toEqual({ strength: 0.06, deep: 1 });
    expect(gasCurve(64)).toEqual({ strength: 0.06, deep: 1 });
    // never rises again as covers grow
    let last = 1;
    for (let px = 0; px <= 64; px += 0.25) {
      const { strength } = gasCurve(px);
      expect(strength, String(px)).toBeLessThanOrEqual(last);
      last = strength;
    }
  });

  it("removes the dust before covers show", () => {
    expect(gasDust(5)).toBe(1);
    expect(gasDust(13)).toBe(1);
    expect(gasDust(17.5)).toBeCloseTo(0.5, 10);
    expect(gasDust(22)).toBe(0);
    expect(gasDust(40)).toBe(0);
  });
});

describe("stopMix and gasPair (which baked stops the slider shows)", () => {
  it("mixes piecewise, as the album positions do", () => {
    expect(stopMix(0)).toEqual({ a: "sonic", b: "balanced", k: 0 });
    expect(stopMix(0.25)).toEqual({ a: "sonic", b: "balanced", k: 0.5 });
    expect(stopMix(0.5)).toEqual({ a: "sonic", b: "balanced", k: 1 });
    expect(stopMix(0.75)).toEqual({ a: "balanced", b: "mood", k: 0.5 });
    expect(stopMix(1)).toEqual({ a: "balanced", b: "mood", k: 1 });
  });

  it("shows one stop at a stop and two between stops", () => {
    expect(stopsShown(0)).toEqual(["sonic"]);
    expect(stopsShown(0.5)).toEqual(["balanced"]);
    expect(stopsShown(1)).toEqual(["mood"]);
    expect(stopsShown(0.25)).toEqual(["sonic", "balanced"]);
    expect(stopsShown(0.9)).toEqual(["balanced", "mood"]);
  });

  it("names the stops a morph passes, and no other", () => {
    expect(stopsOnPath(0.5, 1)).toEqual(["balanced", "mood"]); // Balanced to Mood never shows Sonic
    expect(stopsOnPath(0.5, 0)).toEqual(["sonic", "balanced"]);
    expect(stopsOnPath(0, 1)).toEqual(["sonic", "balanced", "mood"]); // end to end passes Balanced
    expect(stopsOnPath(1, 0)).toEqual(["sonic", "balanced", "mood"]);
    expect(stopsOnPath(0.25, 1)).toEqual(["sonic", "balanced", "mood"]); // an interrupted morph still shows Sonic
    expect(stopsOnPath(0.75, 1)).toEqual(["balanced", "mood"]);
    expect(stopsOnPath(1, 1)).toEqual(["mood"]);
  });

  it("binds one texture at a stop and two between stops", () => {
    expect(gasPair(0, ALL)).toEqual({ a: "sonic", b: "sonic", k: 0 });
    expect(gasPair(0.5, ALL)).toEqual({ a: "balanced", b: "balanced", k: 0 });
    expect(gasPair(1, ALL)).toEqual({ a: "mood", b: "mood", k: 0 });
    expect(gasPair(0.25, ALL)).toEqual({ a: "sonic", b: "balanced", k: 0.5 });
  });

  it("falls back to a loaded stop when the slider reaches one whose texture has not arrived", () => {
    const noMood = { sonic: true, balanced: true, mood: false };
    expect(gasPair(0.75, noMood)).toEqual({ a: "balanced", b: "balanced", k: 0 });
    expect(gasPair(1, noMood)).toEqual({ a: "balanced", b: "balanced", k: 0 });
    expect(gasPair(0.9, { sonic: false, balanced: false, mood: true })).toEqual({ a: "mood", b: "mood", k: 0 });
    expect(gasPair(0.1, { sonic: false, balanced: false, mood: true })).toEqual({ a: "mood", b: "mood", k: 0 });
    expect(gasPair(0.5, { sonic: false, balanced: false, mood: false })).toBeNull();
  });
});

describe("gasStopsToStart (which baked stops a map loads)", () => {
  it("starts only the stop on screen while the map is a dimmed backdrop", () => {
    expect(gasStopsToStart("balanced", false)).toEqual(["balanced"]);
    expect(gasStopsToStart("mood", false)).toEqual(["mood"]);
  });

  it("starts all three on an interactive map, the stop on screen first", () => {
    expect(gasStopsToStart("balanced", true)).toEqual(["balanced", "sonic", "mood"]);
    expect(gasStopsToStart("mood", true)).toEqual(["mood", "sonic", "balanced"]);
  });
});

describe("gasUploadWait (when a gas image that is not on screen may be uploaded)", () => {
  it("waits for a quiet moment after the last input and the last drawn frame", () => {
    expect(GAS_UPLOAD_QUIET_MS).toBe(250);
    // nothing has happened for a long time: now
    expect(gasUploadWait(5000, 1000, 1200)).toBe(0);
    expect(gasUploadWait(5000, -Infinity, -Infinity)).toBe(0);
    // input 100 ms ago: 150 ms more
    expect(gasUploadWait(5000, 4900, 1200)).toBe(150);
    // a frame 10 ms ago (a fling or a camera move, with no input): 240 ms more
    expect(gasUploadWait(5000, 1000, 4990)).toBe(240);
    // the later of the two counts
    expect(gasUploadWait(5000, 4990, 4900)).toBe(240);
    // exactly at the end of the quiet time
    expect(gasUploadWait(5000, 4750, 4750)).toBe(0);
  });

  it("stops waiting for a quiet map after the longest wait, so constant input cannot starve an image", () => {
    expect(GAS_UPLOAD_MAX_WAIT_MS).toBe(4000);
    expect(gasUploadOverdue(1000, 0)).toBe(false);
    expect(gasUploadOverdue(3999, 0)).toBe(false);
    expect(gasUploadOverdue(4000, 0)).toBe(true);
    expect(gasUploadOverdue(9000, 5500)).toBe(false);
    // two uploads never share a frame, and the caps on a busy GPU are bounded
    expect(GAS_UPLOAD_GAP_MS).toBeGreaterThan(1000 / 60);
    expect(GAS_BUSY_UPLOAD_CAP_MS).toBeLessThan(GAS_FIRST_UPLOAD_CAP_MS);
  });

  it("never lets an upload through while input keeps coming", () => {
    // a drag: an input event every 16 ms
    for (let now = 0; now < 3000; now += 16) expect(gasUploadWait(now + 8, now, now)).toBeGreaterThan(200);
  });
});

describe("focusPool (the dim area around an open album's group)", () => {
  const pos = new Float32Array([0, 0, 2, 0, 0, 2, 9, 9]);

  it("is centred on the group's box and reaches 0.3 of its diagonal", () => {
    const p = focusPool(pos, [0, 1, 2], 0.1)!;
    expect(p[0]).toBe(1);
    expect(p[1]).toBe(1);
    expect(p[2]).toBeCloseTo(Math.hypot(2, 2) * 0.3, 10);
  });

  it("never gets smaller than the given radius", () => {
    expect(focusPool(pos, [0], 0.5)).toEqual([0, 0, 0.5]);
  });

  it("is null without a known album", () => {
    expect(focusPool(pos, [], 0.5)).toBeNull();
    expect(focusPool(pos, [99], 0.5)).toBeNull();
  });
});

describe("texture and noise", () => {
  it("needs textures of the baked size", () => {
    expect(GAS_TEXTURE_PX).toBe(2048);
    expect(gasTextureFits(2048)).toBe(true);
    expect(gasTextureFits(16384)).toBe(true);
    expect(gasTextureFits(1024)).toBe(false);
  });

  it("builds the noise table the bake was shaded with (scripts/theme/bake-core.js noiseTable)", () => {
    const t = gasNoise();
    expect(t.length).toBe(65536);
    expect(Array.from(t.slice(0, 8))).toEqual([2, 15, 250, 178, 133, 103, 119, 61]);
    expect(t[65535]).toBe(213);
    expect(t.reduce((s, v) => s + v, 0)).toBe(8329196);
  });

  it("names the baked files", () => {
    expect(gasUrl("mood")).toBe("/data/theme/gas-mood.webp");
  });
});

describe("gas shader source", () => {
  it("declares every uniform GasField sets", () => {
    for (const name of ["u_gasA", "u_gasB", "u_noise", "u_mix", "u_ppr", "u_bakePpr", "u_bakeHalf", "u_strength", "u_deep", "u_dust", "u_poolAmt", "u_pool"]) {
      expect(GAS_FRAGMENT_SHADER, name).toMatch(new RegExp(`uniform \\w+ ${name};`));
    }
    for (const name of ["u_tx", "u_quadHalf"]) expect(GAS_VERTEX_SHADER, name).toMatch(new RegExp(`uniform \\w+ ${name};`));
  });

  it("has no clock: nothing in the gas can move at rest", () => {
    expect(GAS_VERTEX_SHADER + GAS_FRAGMENT_SHADER).not.toMatch(/u_time|u_clock|u_frame/);
  });

  it("in deep zoom loses colour, detail and focus on one uniform, as the prototype does", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_DESAT = 0.3500;");
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_LOD_A = 3.5000;");
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_LOD_B = 5.0000;");
    expect(GAS_FRAGMENT_SHADER).toContain("t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);");
    // at full deep zoom that factor is 0, so the four noise reads are skipped
    expect(GAS_FRAGMENT_SHADER).toContain("if (u_ppr > u_bakePpr && u_deep < 1.0) {");
    expect(GAS_FRAGMENT_SHADER).toContain("if (u_deep > 0.0) t = mix(t, 0.5 * (gasLod(uv, DEEP_LOD_A) + gasLod(uv, DEEP_LOD_B)), u_deep);");
    expect(GAS_FRAGMENT_SHADER).toContain("des = 1.0 - (1.0 - des) * (1.0 - DEEP_DESAT * u_deep);");
    expect(GAS_FRAGMENT_SHADER).toContain("max(lod + 3.5, DEEP_LOD_A * u_deep)");
    expect(GAS_FRAGMENT_SHADER).toContain("max(lod + 5.0, DEEP_LOD_B * u_deep)");
  });

  it("applies strength, dust and the pool to the light, not to the colour", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("1.0 - pow(max(1.0 - t.rgb, vec3(0.002)), vec3(k * mix(1.0, t.a, u_dust)))");
    expect(GAS_FRAGMENT_SHADER).toContain("k *= mix(1.0, mix(0.6, 0.25, e), u_poolAmt);");
  });

  it("reads the upright bake (north at the top of the image) and ends in sky beyond it", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("vec2(v_raw.x + u_bakeHalf, u_bakeHalf - v_raw.y) / (2.0 * u_bakeHalf)");
    expect(GAS_FRAGMENT_SHADER).toContain("vec4(0.0, 0.0, 0.0, 1.0)");
  });

  it("takes its glow from the bake's own mips", () => {
    expect(GAS_GLOW).toBe(0.18);
    expect(GAS_FRAGMENT_SHADER).toContain("const float GLOW = 0.1800;");
    expect(GAS_FRAGMENT_SHADER).toMatch(/textureLod\(u_gasA, c, lod\)/);
  });

  it("draws the quad behind the album points", () => {
    expect(GAS_VERTEX_SHADER).toContain("vec4(world, -1.0, 1.0)");
  });

  it("has balanced braces and brackets", () => {
    for (const src of [GAS_VERTEX_SHADER, GAS_FRAGMENT_SHADER]) {
      for (const [open, close] of [["{", "}"], ["(", ")"]]) expect(src.split(open).length, open).toBe(src.split(close).length);
    }
  });

  it("dims the gas on the dimmed pages", () => {
    expect(GAS_DIMMED_STRENGTH).toBeGreaterThan(0.3);
    expect(GAS_DIMMED_STRENGTH).toBeLessThan(1);
  });
});
