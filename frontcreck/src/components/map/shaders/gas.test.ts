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
  GAS_REFERENCE_PX,
  GAS_SHARP_STRIPS,
  GAS_SHARP_TEXTURE_PX,
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
  gasLodBias,
  gasRectUniform,
  gasRestingStop,
  gasSharpBlocked,
  gasSharpPlan,
  gasSharpStrips,
  gasSharpWanted,
  gasStopsToStart,
  gasTexelsPerRaw,
  gasUploadOverdue,
  gasUploadWait,
  gasTextureFits,
  gasImageFits,
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
    // the prototype's mip levels 4.5 and 6 of its 4096 px bake of the whole square
    expect(GAS_DEEP_LOD).toEqual([4.5, 6]);
    expect(GAS_REFERENCE_PX).toBe(4096);
  });

  it("reads the deep zoom blur and the glow as wide on screen from any image (gasLodBias)", () => {
    // the sharper image has the prototype's texels per raw unit: no shift
    expect(gasLodBias(4096 / 3.2, 1.6)).toBeCloseTo(0, 12);
    // a 2048 px image of the whole square is one level lower: 3.5 and 5, the numbers before images had rectangles
    expect(GAS_DEEP_LOD.map((l) => l + gasLodBias(2048 / 3.2, 1.6))).toEqual([3.5, 5]);
    // more texels per raw unit, higher levels
    expect(gasLodBias(700, 1.6)).toBeGreaterThan(gasLodBias(640, 1.6));
    expect(gasLodBias(700, 1.6)).toBeCloseTo(Math.log2(700 / 1280), 12);
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
  it("maps a stop's raw rectangle to its upright image", () => {
    const rect = [-1.4, -1.2, 1.1, 1.3] as const;
    expect(gasTexelsPerRaw(rect, 2048)).toBeCloseTo(2048 / 2.5, 9);
    const [west, north, perW, perH] = gasRectUniform(rect);
    expect([west, north]).toEqual([-1.4, 1.3]);
    // the shader's uv = ((x - west) * perW, (north - y) * perH): the north west corner is (0, 0), the south east (1, 1)
    const uv = (x: number, y: number) => [(x - west) * perW, (north - y) * perH];
    expect(uv(-1.4, 1.3)).toEqual([0, 0]);
    expect(uv(1.1, -1.2)[0]).toBeCloseTo(1, 12);
    expect(uv(1.1, -1.2)[1]).toBeCloseTo(1, 12);
    expect(uv(-0.15, 0.05)[0]).toBeCloseTo(0.5, 12);
    expect(uv(-0.15, 0.05)[1]).toBeCloseTo(0.5, 12);
  });

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
    // the hash of the file's own bytes is in its name (theme.json gas.<stop>.hash), so a cached image of an
    // earlier bake can never be drawn with a newer theme.json
    expect(gasUrl("mood", ["0123456789", "abcdef0123"])).toBe("/data/theme/gas-mood.0123456789.webp");
    expect(gasUrl("mood", ["0123456789", "abcdef0123"], true)).toBe("/data/theme/gas-mood-sharp.abcdef0123.webp");
  });

  it("refuses a decoded image that is not the size theme.json says (an image of another bake)", () => {
    expect(gasImageFits({ width: 1803, height: 2048 }, [1803, 2048])).toBe(true);
    // the whole square of the bake before the rectangles: drawn into the rectangle it would sit beside the albums
    expect(gasImageFits({ width: 2048, height: 2048 }, [1803, 2048])).toBe(false);
    expect(gasImageFits({ width: 2048, height: 1803 }, [1803, 2048])).toBe(false);
    expect(gasImageFits({ width: 1803, height: 2047 }, [1803, 2048])).toBe(false);
  });
});

describe("the sharper image (one stop at a time, desktops with a real GPU)", () => {
  const DESKTOP = { maxTextureSize: 16384, coarsePointer: false, renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)" };

  it("is for desktops with a real GPU only", () => {
    expect(GAS_SHARP_TEXTURE_PX).toBe(4096);
    expect(gasSharpBlocked(DESKTOP)).toBeNull();
    expect(gasSharpBlocked({ ...DESKTOP, deviceMemory: 8, saveData: false })).toBeNull();
    expect(gasSharpBlocked({ ...DESKTOP, maxTextureSize: 4096 })).toBeNull();
    expect(gasSharpBlocked({ ...DESKTOP, maxTextureSize: 2048 })).toBe("textures too small");
    expect(gasSharpBlocked({ ...DESKTOP, coarsePointer: true })).toBe("touch device");
    expect(gasSharpBlocked({ ...DESKTOP, renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)" })).toBe("software renderer");
    expect(gasSharpBlocked({ ...DESKTOP, renderer: "llvmpipe (LLVM 15.0.7, 256 bits)" })).toBe("software renderer");
    expect(gasSharpBlocked({ ...DESKTOP, renderer: "Microsoft Basic Render Driver" })).toBe("software renderer");
    expect(gasSharpBlocked({ ...DESKTOP, deviceMemory: 2 })).toBe("little memory");
    expect(gasSharpBlocked({ ...DESKTOP, saveData: true })).toBe("save data");
  });

  const AT = { allowed: true, interactive: true, stop: "balanced" as const, sliderT: 0.5, ppr: 1005, texelsPerRaw: 700, deep: 0 };

  it("is wanted only where the first image is magnified, at rest at a stop, on an interactive map", () => {
    expect(gasSharpWanted(AT)).toBe("balanced");
    expect(gasSharpWanted({ ...AT, stop: "mood", sliderT: 1 })).toBe("mood");
    expect(gasSharpWanted({ ...AT, allowed: false })).toBeNull();
    // Home, About, 404 and the phone's album list: one image, never a second
    expect(gasSharpWanted({ ...AT, interactive: false })).toBeNull();
    // the slider is on its way to Mood
    expect(gasSharpWanted({ ...AT, stop: "mood", sliderT: 0.7 })).toBeNull();
    // zoomed out: the screen shows no more than the first image holds
    expect(gasSharpWanted({ ...AT, ppr: 700 })).toBeNull();
    expect(gasSharpWanted({ ...AT, ppr: 377 })).toBeNull();
    // full deep zoom reads a blurred copy
    expect(gasSharpWanted({ ...AT, ppr: 9000, deep: 1 })).toBeNull();
    expect(gasSharpWanted({ ...AT, ppr: 9000, deep: 0.5 })).toBe("balanced");
  });

  it("knows where the slider rests", () => {
    expect(gasRestingStop("sonic", 0)).toBe("sonic");
    expect(gasRestingStop("balanced", 0.5)).toBe("balanced");
    expect(gasRestingStop("mood", 1)).toBe("mood");
    expect(gasRestingStop("mood", 0.5)).toBeNull(); // asked for, not there yet
    expect(gasRestingStop("balanced", 0.62)).toBeNull();
  });

  it("starts a stop's sharper image when nothing is held or loading", () => {
    expect(gasSharpPlan(null, null, "balanced", "balanced", true)).toEqual({ release: false, cancel: false, start: "balanced" });
    expect(gasSharpPlan(null, null, null, "balanced", true)).toEqual({ release: false, cancel: false, start: null });
  });

  it("does nothing while it holds or loads the wanted one", () => {
    expect(gasSharpPlan("balanced", null, "balanced", "balanced", true)).toEqual({ release: false, cancel: false, start: null });
    expect(gasSharpPlan(null, "balanced", "balanced", "balanced", true)).toEqual({ release: false, cancel: false, start: null });
  });

  it("keeps the held one through a morph and through zooming out", () => {
    // the slider is moving (rests nowhere): the fade starts from the sharper image
    expect(gasSharpPlan("balanced", null, null, null, true)).toEqual({ release: false, cancel: false, start: null });
    expect(gasSharpPlan(null, "balanced", null, null, true)).toEqual({ release: false, cancel: false, start: null });
    // at rest at its stop but zoomed out (not wanted): kept, so zooming back in needs no second download
    expect(gasSharpPlan("balanced", null, null, "balanced", true)).toEqual({ release: false, cancel: false, start: null });
  });

  it("frees the held one once the slider rests elsewhere, and starts the new stop's in the same step", () => {
    expect(gasSharpPlan("balanced", null, "mood", "mood", true)).toEqual({ release: true, cancel: false, start: "mood" });
    // at rest at Mood but zoomed out: the old one still goes
    expect(gasSharpPlan("balanced", null, null, "mood", true)).toEqual({ release: true, cancel: false, start: null });
    expect(gasSharpPlan(null, "balanced", "mood", "mood", true)).toEqual({ release: false, cancel: true, start: "mood" });
  });

  it("never plans a second sharper image beside one that stays", () => {
    const stops = ["sonic", "balanced", "mood", null] as const;
    for (const have of stops) for (const loading of stops) for (const wanted of stops) for (const resting of stops) for (const interactive of [true, false]) {
      const plan = gasSharpPlan(have, loading, wanted, resting, interactive);
      const kept = [plan.release ? null : have, plan.cancel ? null : loading, plan.start].filter((s) => s !== null);
      expect(kept.length, JSON.stringify({ have, loading, wanted, resting, interactive })).toBeLessThanOrEqual(have !== null && loading !== null && !plan.release && !plan.cancel ? 2 : 1);
      if (plan.start) expect(kept).toEqual([plan.start]);
    }
  });

  it("frees and cancels everything when the map stops being interactive", () => {
    expect(gasSharpPlan("balanced", null, null, "balanced", false)).toEqual({ release: true, cancel: false, start: null });
    expect(gasSharpPlan(null, "mood", null, null, false)).toEqual({ release: false, cancel: true, start: null });
  });

  it("uploads in strips that cover every row once, in order", () => {
    expect(GAS_SHARP_STRIPS).toBe(16);
    for (const h of [3747, 3242, 3594, 16, 5]) {
      const strips = gasSharpStrips(h);
      expect(strips.length).toBe(Math.min(16, h));
      expect(strips[0][0]).toBe(0);
      expect(strips[strips.length - 1][1]).toBe(h);
      for (let i = 1; i < strips.length; i++) expect(strips[i][0]).toBe(strips[i - 1][1]);
      for (const [a, b] of strips) expect(b).toBeGreaterThan(a);
    }
    // no strip of the tallest image is more than a sixteenth of it, rounded up
    expect(Math.max(...gasSharpStrips(3747).map(([a, b]) => b - a))).toBeLessThanOrEqual(Math.ceil(3747 / 16));
  });
});

describe("gas shader source", () => {
  it("declares every uniform GasField sets", () => {
    for (const name of ["u_gasA", "u_gasB", "u_noise", "u_mix", "u_ppr", "u_bakePpr", "u_octPpr", "u_lodBias", "u_rectA", "u_rectB", "u_strength", "u_deep", "u_dust", "u_poolAmt", "u_pool"]) {
      expect(GAS_FRAGMENT_SHADER, name).toMatch(new RegExp(`uniform \\w+ ${name};`));
    }
    for (const name of ["u_tx", "u_quadHalf"]) expect(GAS_VERTEX_SHADER, name).toMatch(new RegExp(`uniform \\w+ ${name};`));
  });

  it("has no clock: nothing in the gas can move at rest", () => {
    expect(GAS_VERTEX_SHADER + GAS_FRAGMENT_SHADER).not.toMatch(/u_time|u_clock|u_frame/);
  });

  it("in deep zoom loses colour, detail and focus on one uniform, as the prototype does", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_DESAT = 0.3500;");
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_LOD_A = 4.5000;");
    expect(GAS_FRAGMENT_SHADER).toContain("const float DEEP_LOD_B = 6.0000;");
    // counted from the prototype's bake and shifted to the image on screen
    expect(GAS_FRAGMENT_SHADER).toContain("float deepA = DEEP_LOD_A + u_lodBias;");
    expect(GAS_FRAGMENT_SHADER).toContain("float deepB = DEEP_LOD_B + u_lodBias;");
    expect(GAS_FRAGMENT_SHADER).toContain("t.rgb *= 1.0 + 1.6 * d * (1.0 - u_deep);");
    // at full deep zoom that factor is 0, so the four noise reads are skipped
    expect(GAS_FRAGMENT_SHADER).toContain("if (u_ppr > u_octPpr && u_deep < 1.0) {");
    expect(GAS_FRAGMENT_SHADER).toContain("if (u_deep > 0.0) t = mix(t, 0.5 * (gasLod(deepA) + gasLod(deepB)), u_deep);");
    expect(GAS_FRAGMENT_SHADER).toContain("des = 1.0 - (1.0 - des) * (1.0 - DEEP_DESAT * u_deep);");
    expect(GAS_FRAGMENT_SHADER).toContain("max(lod + 3.5, deepA * u_deep)");
    expect(GAS_FRAGMENT_SHADER).toContain("max(lod + 5.0, deepB * u_deep)");
  });

  it("adds noise octaves only past the resolution the bake was shaded for, never past the first image's own", () => {
    // The octaves the images hold are those of the sharper bake (the first image is that bake resampled), so the
    // test for adding more reads u_octPpr. Reading the first image's texel count there made blotches of plain
    // value noise stand in for swirl beside an open album (review item M1).
    expect(GAS_FRAGMENT_SHADER).toContain("float have = sm(1.5, 4.0, u_octPpr / (6.25 * fq));");
    expect(GAS_FRAGMENT_SHADER).toContain("float want = sm(1.5, 4.0, u_ppr / (6.25 * fq));");
    expect(GAS_FRAGMENT_SHADER).not.toMatch(/u_bakePpr \/ \(6\.25/);
    // the same rule in numbers: at the prototype's 1280 texels per raw unit nothing is added at Overview
    // (1005 px per raw unit) and the first octave that is added beside an album (1609) is the 78.7 one
    const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const added = (ppr: number, fq: number) => Math.max(0, sm(1.5, 4, ppr / (6.25 * fq)) - sm(1.5, 4, 1280 / (6.25 * fq)));
    expect(1005 > 1280).toBe(false);
    expect(added(1609, 38)).toBe(0);
    expect(added(1609, 38 * 2.07)).toBeGreaterThan(0.3);
  });

  it("applies strength, dust and the pool to the light, not to the colour", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("1.0 - pow(max(1.0 - t.rgb, vec3(0.002)), vec3(k * mix(1.0, t.a, u_dust)))");
    expect(GAS_FRAGMENT_SHADER).toContain("k *= mix(1.0, mix(0.6, 0.25, e), u_poolAmt);");
  });

  it("reads each upright image over its own rectangle (north at the top) and ends in sky beyond it", () => {
    expect(GAS_FRAGMENT_SHADER).toContain("return vec2((v_raw.x - r.x) * r.z, (r.y - v_raw.y) * r.w);");
    expect(GAS_FRAGMENT_SHADER).toContain("g_uvA = uvIn(u_rectA);");
    expect(GAS_FRAGMENT_SHADER).toContain("g_uvB = uvIn(u_rectB);");
    expect(GAS_FRAGMENT_SHADER).toContain("vec4(0.0, 0.0, 0.0, 1.0)");
    // the fade to sky lies inside the image's empty padding and reaches exactly sky at its edge
    expect(GAS_FRAGMENT_SHADER).toContain("return sm(0.48, 0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5)));");
    // worked out once per pixel for image A, and for image B only while two stops are mixed
    expect(GAS_FRAGMENT_SHADER.match(/skyAt\(g_uv/g)).toHaveLength(2);
    expect(GAS_FRAGMENT_SHADER).toMatch(/if \(u_mix > 0\.0\) \{\s+g_uvB = uvIn\(u_rectB\);\s+g_skyB = skyAt\(g_uvB\);/);
  });

  it("reads no more textures per pixel than before the images had rectangles", () => {
    // one read of each bound image for the gas, two mip reads for the glow (and two for the deep zoom blur, only
    // in deep zoom), the grain, and at most four octaves of noise
    const main = GAS_FRAGMENT_SHADER.slice(GAS_FRAGMENT_SHADER.indexOf("void main()"));
    expect(main.match(/gas\(\)/g)).toHaveLength(1);
    expect(main.match(/gasLod\(/g)).toHaveLength(4);
    expect(main.match(/vn\(/g)).toHaveLength(1);
    expect(main.match(/texelFetch\(/g)).toHaveLength(1);
    expect(GAS_FRAGMENT_SHADER.match(/texture2D\(|textureLod\(|texelFetch\(/g)).toHaveLength(6);
  });

  it("takes its glow from the bake's own mips", () => {
    expect(GAS_GLOW).toBe(0.18);
    expect(GAS_FRAGMENT_SHADER).toContain("const float GLOW = 0.1800;");
    expect(GAS_FRAGMENT_SHADER).toMatch(/textureLod\(u_gasA, clamp\(g_uvA, 0\.0, 1\.0\), lod\)/);
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
