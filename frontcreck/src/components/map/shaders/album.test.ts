import { describe, expect, it } from "vitest";

import { COVER_MAX_PX, COVER_WORLD, coverCssPx, pxPerWorld, zoomForCoverPx } from "../state/zoomLimits";
import { renderedSpriteCssSize, spriteCssSize } from "./album";

const H = 836; // canvas height of a 1440 x 900 window, CSS px
const FIT = 0.784; // its fitted overview zoom (whole cloud, mockup padding)
const PHONE_H = 784;
const PHONE_FIT = 0.347;

describe("spriteCssSize (JS mirror of the vertex shader's sizes)", () => {
  it("is a dot of about 5 px at the desktop overview and 4 px at the phone overview", () => {
    expect(spriteCssSize(FIT, H)).toBeCloseTo(5, 1);
    expect(spriteCssSize(PHONE_FIT, PHONE_H)).toBeCloseTo(4.2, 1);
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
