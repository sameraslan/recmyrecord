import { describe, expect, it } from "vitest";

import { COVER_MAX_PX, COVER_WORLD, coverCssPx, pxPerWorld, zoomForCoverPx } from "../state/zoomLimits";
import { ALBUM_FRAGMENT_SHADER, ALBUM_VERTEX_SHADER, DOT_ALPHA, SELECTION_DIM, renderedSpriteCssSize, selectedIsProminent, selectedSpriteCssSize, spriteCssSize } from "./album";

const H = 836; // canvas height of a 1440 x 900 window, CSS px
const FIT = 0.784; // its fitted overview zoom (whole cloud, mockup padding)
const PHONE_H = 784;
const PHONE_FIT = 0.347;

describe("spriteCssSize (JS mirror of the vertex shader's sizes)", () => {
  it("is a dot of about 3 px at the desktop and phone overviews, as in the mockup", () => {
    expect(spriteCssSize(FIT, H)).toBeCloseTo(3.09, 2);
    expect(spriteCssSize(PHONE_FIT, PHONE_H)).toBe(3);
  });

  it("grows the dot gently until covers start", () => {
    const z = zoomForCoverPx(16, H);
    expect(spriteCssSize(z, H)).toBeGreaterThan(6);
    expect(spriteCssSize(z, H)).toBeLessThanOrEqual(7.2);
  });

  it("is the cover size, linear in the map scale, once covers are fully shown", () => {
    const z = zoomForCoverPx(32, H);
    expect(spriteCssSize(z, H)).toBeCloseTo(32, 6);
    expect(spriteCssSize(1.5 * z, H)).toBeCloseTo(48, 6);
    expect(coverCssPx(z, H)).toBeCloseTo(COVER_WORLD * pxPerWorld(z, H), 10);
  });

  it("caps covers at 64 px", () => {
    expect(spriteCssSize(100, H)).toBe(COVER_MAX_PX);
  });

  it("stays a dot while the album's atlas sheet is not loaded", () => {
    const z = zoomForCoverPx(48, H);
    expect(spriteCssSize(z, H, false)).toBeLessThanOrEqual(7.2);
  });
});

describe("renderedSpriteCssSize (sizes plus the shader's device-px caps)", () => {
  it("matches the base size when no cap applies", () => {
    expect(renderedSpriteCssSize(FIT, H, 1)).toBeCloseTo(spriteCssSize(FIT, H), 10);
  });

  it("applies the 18%-of-viewport cap", () => {
    // 64 px cover on a 300 px canvas: capped at 0.18 * 300 = 54 px.
    expect(renderedSpriteCssSize(100, 300, 1)).toBeCloseTo(54, 10);
  });

  it("applies the 240 device-px cap on a high-dpr screen", () => {
    // 64 px * 1.5 * dpr 3 = 288 device px, capped at 240 -> 80 CSS px.
    expect(renderedSpriteCssSize(100, 2000, 3, 1.5)).toBeCloseTo(80, 10);
  });
});

describe("the picked album in cover mode (mockup max(cs * 1.8, 64))", () => {
  it("is prominent only once covers are more than half faded in, and only with its atlas sheet", () => {
    expect(selectedIsProminent(zoomForCoverPx(16, H), H, true)).toBe(false);
    expect(selectedIsProminent(zoomForCoverPx(32, H), H, true)).toBe(true);
    expect(selectedIsProminent(zoomForCoverPx(32, H), H, false)).toBe(false);
  });

  it("is at least 64 px, then 1.8 times the cover", () => {
    expect(selectedSpriteCssSize(zoomForCoverPx(32, H), H, 1)).toBeCloseTo(64, 5);
    expect(selectedSpriteCssSize(zoomForCoverPx(48, H), H, 1)).toBeCloseTo(86.4, 3);
  });

  it("keeps its frame inside the viewport-relative sprite cap", () => {
    // 64 px covers on a 400 px tall canvas: the cap is 72 px, the frame takes 12 of it.
    expect(selectedSpriteCssSize(zoomForCoverPx(64, 400), 400, 2)).toBeCloseTo(60, 5);
  });
});

describe("albums outside the focus in album view", () => {
  it("keep their overview size, as in the mockup, and only fade (hit tests use the same size)", () => {
    const dimBranch = ALBUM_VERTEX_SHADER.slice(ALBUM_VERTEX_SHADER.indexOf("v_dim = 1.0;"));
    expect(dimBranch.slice(0, dimBranch.indexOf("}"))).not.toMatch(/baseCss\s*\*=/);
  });
});

describe("the dimmed map behind Home, About and 404", () => {
  it("draws its dots 1.35 times larger, easing with the dot alpha (mockup muted)", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float mutedT = clamp\(\(0\.7800 - u_dotAlpha\) \/ 0\.4400, 0\.0, 1\.0\);\s*dotCss \*= 1\.0 \+ 0\.3500 \* mutedT;/);
  });
});

describe("stars in the album draw", () => {
  it("takes the star, tint and gas attributes, and no cluster colour", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec4 a_star;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec3 a_tint;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/attribute vec3 a_bg;/);
    expect(ALBUM_VERTEX_SHADER + ALBUM_FRAGMENT_SHADER).not.toMatch(/a_clusterId|u_clusterColors|v_clusterId/);
  });

  it("mixes the gas luminance by the slider with the same piecewise rule as the positions", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float t = u_sliderT \* 2\.0;\s*return mix\(a_bg\.x, a_bg\.y, t\);/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/float t = \(u_sliderT - 0\.5\) \* 2\.0;\s*return mix\(a_bg\.y, a_bg\.z, t\);/);
  });

  it("sizes the star from the dot rule at Overview and fades it out as the cover fades in", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float sizeK = dotCss \/ 5\.7683;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/\* \(1\.0 - coverT\) \* clamp\(sizeK \* sizeK, 0\.45, 1\.0\)/);
  });

  it("holds the under-disc to gas of luminance 0.5 with at most 0.26 alpha", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float under = clamp\(1\.0 - 0\.5000 \/ max\(interpolateBg\(\) \* 0\.6000, 0\.001\), 0\.0, 0\.2600\);/);
  });

  it("gives a sprite on an elevated layer no glow and no under-disc, so its halo cannot write depth", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(layer > 0\.0\) \{\s*starA = 0\.0;\s*under = 0\.0;\s*\}/);
  });

  it("keeps the sprite quad to the star's reach", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float reach = r \* mix\(2\.6, a_star\.w, haloT\) \+ 1\.0;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/quadCss = min\(max\(quadCss, starQuad\), capCss\);/);
  });

  it("writes premultiplied colour and discards fragments with neither colour nor alpha", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/vec3 rgb = col \* alpha \+ v_tint\.rgb \* light \* \(1\.0 - alpha\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float a = alpha \+ under \* \(1\.0 - alpha\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(a < 0\.004 && max\(rgb\.r, max\(rgb\.g, rgb\.b\)\) < 0\.004\) discard;/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/gl_FragColor = vec4\(rgb, a\);/);
  });

  it("uses the Trifid frame and backing colours, and none of the old lamp, paper or room literals", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/const vec3 FRAME = vec3\(0\.9451, 0\.9255, 0\.8941\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/const vec3 BACKING = vec3\(0\.0275, 0\.0235, 0\.0392\);/);
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/\b(PAPER|LAMP|ROOM)\b/);
  });
});

describe("overlapping covers are handled as before the theme", () => {
  it("keeps today's handling of overlapping covers: a cover that steps back turns see-through, it is not darkened", () => {
    // Outside an open album's focus (0.45) and, for the cover part only, while another album is picked (0.5).
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(v_dim > 0\.5\) alpha \*= u_focusDim;/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(v_selDim > 0\.5\) alpha \*= mix\(1\.0, u_selDim, v_coverT\);/);
    expect(SELECTION_DIM).toBe(0.5);
    // No opaque darkening towards the page colour in place of the fade.
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/mix\(col, BACKING, [^)]*(u_selDim|0\.6)/);
  });

  it("still lifts the hovered, the focused and the picked album above the covers they overlap", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(u_focusedAlbumIndex >= 0\.0 && isHighlighted\(instanceIndex\)\) layer = 0\.1;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(abs\(u_hoverIndex - instanceIndex\) < 0\.5\) layer = 0\.2;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(abs\(u_focusedAlbumIndex - instanceIndex\) < 0\.5\) layer = 0\.3;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/if \(v_sel > 0\.5\) layer = 0\.4;/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/vec4 mvPos = modelViewMatrix \* vec4\(worldPos, layer, 1\.0\);/);
  });

  it("keeps the cross-fade band: a rounded tile from 16 to 32 px, growing from the dot size, 78% to 100% opaque", () => {
    expect(ALBUM_VERTEX_SHADER).toMatch(/float coverT = smoothstep\(16\.0000, 32\.0000, coverCss\)/);
    expect(ALBUM_VERTEX_SHADER).toMatch(/float baseCss = mix\(dotCss, coverCss, coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float corner = mix\(halfSize, min\(halfSize, 2\.0\), v_coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float mask = 1\.0 - smoothstep\(-0\.5 \* aa, 0\.5 \* aa, sd\);/);
    expect(DOT_ALPHA).toBe(0.78);
  });

  it("tints the fading tile with the album's own star colour and eases it in from the star", () => {
    // Today's colour and alpha formulas, with the star colour where the cluster colour was and an ease over the
    // first eighth of the fade. Not the square of the fade: that left a half-faded cover 16% opaque.
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/col = mix\(v_tint\.rgb, sampleAtlas\(int\(v_atlasIndex\), v_atlasRect\.xy \+ local \* v_atlasRect\.zw\), v_coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/uniform float u_dotAlpha;/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/alpha = mask \* mix\(u_dotAlpha, 1\.0, v_coverT\) \* smoothstep\(0\.0, 0\.125, v_coverT\);/);
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/v_coverT \* v_coverT/);
  });

  it("keeps the picked cover's 1 px backing and lets the map show through the gap up to its frame", () => {
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float back = 1\.0 - smoothstep\(1\.0 - 0\.5 \* aa, 1\.0 \+ 0\.5 \* aa, squareSd\(p, halfSize\)\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/alpha = max\(alpha, back\);/);
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/band\(squareSd\(p, halfSize \+ 4\.0000\), 2\.0000, aa\)/);
  });
});
