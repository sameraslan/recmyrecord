import { describe, expect, it } from "vitest";

import { releaseView } from "./view";

const framing = {
  zoom: 1.007,
  center: { x: -0.06, y: 0.02 },
  bounds: { minX: -0.6, maxX: 0.5, minY: -0.4, maxY: 0.45 },
};

describe("releaseView", () => {
  it("returns the captured pre-focus view when there is one", () => {
    const pre = { x: 0.31, y: -0.12, zoom: 1.8 };
    expect(releaseView(pre, framing)).toEqual({ x: 0.31, y: -0.12, zoom: 1.8 });
  });

  it("falls back to the fit framing centre and fit zoom when nothing was captured", () => {
    expect(releaseView(null, framing)).toEqual({ x: -0.06, y: 0.02, zoom: 1.007 });
  });

  it("returns a copy, so later mutation of the result never touches the inputs", () => {
    const pre = { x: 1, y: 2, zoom: 3 };
    const out = releaseView(pre, framing);
    out.x = 99;
    expect(pre.x).toBe(1);
    const fallback = releaseView(null, framing);
    fallback.x = 99;
    expect(framing.center.x).toBe(-0.06);
  });
});
