import { describe, expect, it } from "vitest";

import { renderedSpriteCssSize, spriteCssSize } from "./album";

describe("spriteCssSize (JS mirror of the vertex shader's size curve)", () => {
  it("is 5px at the fitted overview zoom", () => {
    expect(spriteCssSize(1, 1)).toBe(5);
  });

  it("starts the cover cross-fade (24px) near 2.28x the fit zoom", () => {
    expect(Math.abs(spriteCssSize(2.283, 1) - 24)).toBeLessThan(0.5);
  });

  it("completes the covers (40px) near 3x the fit zoom", () => {
    expect(Math.abs(spriteCssSize(3, 1) - 40.5)).toBeLessThan(1);
  });

  it("clamps to [3, 90]", () => {
    expect(spriteCssSize(10, 1)).toBe(90);
    expect(spriteCssSize(0.1, 1)).toBe(3);
  });

  it("guards a zero fit zoom like the shader's max(u_fitZoom, 0.0001)", () => {
    expect(spriteCssSize(1, 0)).toBe(90);
  });
});

describe("renderedSpriteCssSize (size curve plus the shader's device-px caps)", () => {
  it("matches the curve when no cap applies", () => {
    expect(renderedSpriteCssSize(1, 1, 900, 1)).toBeCloseTo(5, 10);
  });

  it("applies the 18%-of-viewport cap after the per-instance scale", () => {
    // 90px * 1.25 = 112.5px, capped at 0.18 * 500 = 90px.
    expect(renderedSpriteCssSize(50, 1, 500, 1, 1.25)).toBeCloseTo(90, 10);
  });

  it("applies the 240 device-px cap on a high-dpr screen", () => {
    // 90px * 1.25 * dpr 3 = 337.5 device px, capped at 240 -> 80 CSS px.
    expect(renderedSpriteCssSize(50, 1, 2000, 3, 1.25)).toBeCloseTo(80, 10);
  });
});
