import { describe, expect, it } from "vitest";

import fs from "node:fs";
import path from "node:path";

import { HEADER_NARROW_PX, HEADER_PX } from "../types";
import { COVER_MAX_PX, COVER_WORLD, MAX_ZOOM, coverCssPx, pxPerWorld, visibleScale, zoomForCoverPx } from "../state/zoomLimits";
import { ALBUM_FRAGMENT_SHADER, ALBUM_VERTEX_SHADER, DOT_ALPHA, SELECTION_DIM, renderedSpriteCssSize, selectedIsProminent, selectedSpriteCssSize, spriteCapDevicePx, spriteCssSize } from "./album";

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
    expect(renderedSpriteCssSize(FIT, H, H, 1)).toBeCloseTo(spriteCssSize(FIT, H), 10);
  });

  it("applies the 18%-of-viewport cap", () => {
    // 64 px cover on a 300 px canvas: capped at 0.18 * 300 = 54 px.
    expect(renderedSpriteCssSize(100, 300, 300, 1)).toBeCloseTo(54, 10);
  });

  it("applies the 240 device-px cap on a high-dpr screen", () => {
    // 64 px * 1.5 * dpr 3 = 288 device px, capped at 240 -> 80 CSS px.
    expect(renderedSpriteCssSize(100, 2000, 2000, 3, 1.5)).toBeCloseTo(80, 10);
  });
});

describe("the picked album in cover mode (mockup max(cs * 1.8, 64))", () => {
  it("is prominent only once covers are more than half faded in, and only with its atlas sheet", () => {
    expect(selectedIsProminent(zoomForCoverPx(16, H), H, true)).toBe(false);
    expect(selectedIsProminent(zoomForCoverPx(32, H), H, true)).toBe(true);
    expect(selectedIsProminent(zoomForCoverPx(32, H), H, false)).toBe(false);
  });

  it("is at least 64 px, then 1.8 times the cover", () => {
    expect(selectedSpriteCssSize(zoomForCoverPx(32, H), H, H, 1)).toBeCloseTo(64, 5);
    expect(selectedSpriteCssSize(zoomForCoverPx(48, H), H, H, 1)).toBeCloseTo(86.4, 3);
  });

  it("keeps its frame inside the viewport-relative sprite cap", () => {
    // 64 px covers on a 400 px tall canvas: the cap is 72 px, the frame takes 12 of it.
    expect(selectedSpriteCssSize(zoomForCoverPx(64, 400), 400, 400, 2)).toBeCloseTo(60, 5);
  });
});

describe("sprite sizes with the canvas running under the header", () => {
  // Before the map ran under the header the canvas was the window less the header, at zoom z. Now it is the whole
  // window at zoom z * visibleScale (the same scale on screen), with the header's height as the top inset.
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), "src/components/map", file), "utf8");
  const cases = [
    { window: 700, header: HEADER_PX, picked: 0.18 * 636 - 12 }, // 102.48: the cap binds (18% of 636 px, less the frame)
    { window: 900, header: HEADER_PX, picked: 64 * 1.8 }, // 115.2: the cap (150.48) does not bind
    { window: 700, header: HEADER_NARROW_PX, picked: 0.18 * 640 - 12 }, // 103.2: the phone header, the cap binds
    { window: 620, header: HEADER_NARROW_PX, picked: 0.18 * 560 - 12 },
  ];
  for (const { window: win, header, picked } of cases) {
    it(`a ${win} px tall window under a ${header} px header: the picked cover at the deepest zoom is the size it was (${picked.toFixed(2)} px)`, () => {
      const before = win - header;
      const z = MAX_ZOOM;
      const now = z * visibleScale(win, header);
      for (const dpr of [1, 2]) {
        const was = selectedSpriteCssSize(z, before, before, dpr);
        expect(was).toBeCloseTo(Math.min(picked, 240 / dpr - 12), 6);
        expect(selectedSpriteCssSize(now, win, win - header, dpr)).toBeCloseTo(was, 6);
        // Every other cover too, and a dot.
        expect(renderedSpriteCssSize(now, win, win - header, dpr)).toBeCloseTo(renderedSpriteCssSize(z, before, before, dpr), 6);
        expect(renderedSpriteCssSize(now, win, win - header, dpr, 1, false)).toBeCloseTo(renderedSpriteCssSize(z, before, before, dpr, 1, false), 6);
        // What the shader is given (AlbumField u_maxSpritePx).
        expect(spriteCapDevicePx(win - header, dpr)).toBeCloseTo(0.18 * before * dpr, 9);
      }
    });
  }

  it("a cap taken from the whole canvas would draw the picked cover of a 700 px window 11.52 px larger", () => {
    // The mistake this pins: 18% of the 64 px behind the header.
    const z = MAX_ZOOM * visibleScale(700, HEADER_PX);
    expect(selectedSpriteCssSize(z, 700, 700, 1) - selectedSpriteCssSize(z, 700, 700 - HEADER_PX, 1)).toBeCloseTo(0.18 * HEADER_PX, 6);
  });

  it("the shader, the hit test and the picked-album ring are all given the visible height for the cap", () => {
    // These three need WebGL or a frame loop to run, so their source is read (as AlbumField.stars.test.ts does).
    expect(read("canvas/AlbumField.tsx")).toContain("u.u_maxSpritePx.value = spriteCapDevicePx(state.size.height - input.insetTop, dpr);");
    expect(read("canvas/AlbumField.tsx")).not.toContain("MAX_SPRITE_VIEWPORT_FRACTION");
    const tracker = read("canvas/CursorTracker.tsx");
    expect(tracker).toContain("const visibleHeightCssPx = viewportHeightCssPx - input.insetTop;");
    expect(tracker).toContain("renderedSpriteCssSize(camera.zoom, viewportHeightCssPx, visibleHeightCssPx, pixelRatio, 1, loaded)");
    expect(tracker).toContain("selectedSpriteCssSize(camera.zoom, viewportHeightCssPx, visibleHeightCssPx, pixelRatio)");
    expect(read("canvas/OverlayDriver.tsx")).toContain("renderedSpriteCssSize(camera.zoom, height, height - input.insetTop, gl.getPixelRatio(), 1, loaded)");
  });
});

describe("albums outside the focus in album view", () => {
  it("keep their overview size, as in the mockup, and only fade (hit tests use the same size)", () => {
    const dimBranch = ALBUM_VERTEX_SHADER.slice(ALBUM_VERTEX_SHADER.indexOf("v_dim = 1.0;"));
    expect(dimBranch.slice(0, dimBranch.indexOf("}"))).not.toMatch(/baseCss\s*\*=/);
  });

  it("bring their cover tile in with the cover fade, so at the start of the fade a star beside an open album is still a star and not a flat disc", () => {
    // Approved picture final-album.jpg: small points of mixed size beside the open album. The prototype draws a
    // map cover at the square of the fade there, so it is invisible while covers are 16 to about 20 px; the tile's
    // own ease (the first eighth of the fade) made every album a flat 8 px disc of its star colour at that framing.
    // The extra factor is 1 once covers are fully shown, so a full cover outside the focus is still 45% opaque.
    const cover = ALBUM_FRAGMENT_SHADER.slice(ALBUM_FRAGMENT_SHADER.indexOf("if (v_coverT > 0.0) {"), ALBUM_FRAGMENT_SHADER.indexOf("if (v_sel > 0.5) {"));
    expect(cover).toMatch(/if \(v_dim > 0\.5\) alpha \*= u_focusDim;/);
    expect(cover).toMatch(/if \(v_dim > 0\.5\) alpha \*= v_coverT;/);
    // Only outside an open album's focus: the Explore cross-fade and the picked album's dimming are as they were
    // (the dimming around a pick as the 10k catalog made it: by colour, see album-dim.test.ts).
    expect(cover).toMatch(/alpha = mask \* mix\(u_dotAlpha, 1\.0, v_coverT\) \* smoothstep\(0\.0, 0\.125, v_coverT\);/);
    expect(cover).toMatch(/if \(v_selDim > 0\.5\) col = mix\(BACKING, col, mix\(1\.0, u_selDim, v_coverT\)\);/);
    // The star under the tile is untouched: same size rule, same fade, same 45%.
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/float starA = v_tint\.a \* \(v_dim > 0\.5 \? u_focusDim : 1\.0\);/);
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
  it("keeps today's handling of overlapping covers: outside an open album's focus a cover turns see-through, and around a pick it keeps its alpha and moves to the page colour", () => {
    // Outside an open album's focus (0.45): see-through, not darkened.
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(v_dim > 0\.5\) alpha \*= u_focusDim;/);
    expect(ALBUM_FRAGMENT_SHADER).not.toMatch(/mix\((col, BACKING|BACKING, col), [^;]*u_focusDim/);
    // While another album is picked (0.5), the cover part only: "today" is the 10k catalog's handling, where a
    // dimmed cover stays opaque and hides the covers under it (album-dim.test.ts pins the alpha staying).
    expect(ALBUM_FRAGMENT_SHADER).toMatch(/if \(v_selDim > 0\.5\) col = mix\(BACKING, col, mix\(1\.0, u_selDim, v_coverT\)\);/);
    expect(SELECTION_DIM).toBe(0.5);
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
