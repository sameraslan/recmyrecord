import { describe, expect, it } from "vitest";

import {
  COVER_FADE_END_PX,
  COVER_WORLD,
  MAX_ZOOM,
  coverCssPx,
  coverFade,
  dotCssPx,
  pxPerWorld,
  visibleScale,
  zoomForCoverPx,
  zoomForPxPerWorld,
} from "./zoomLimits";

const H = 836;
const MEDIAN_NEIGHBOUR_GAP = 0.0049; // world units, balanced and sonic layouts

describe("zoom limits", () => {
  it("converts between zoom and map scale both ways", () => {
    expect(pxPerWorld(1, 1100)).toBeCloseTo(1000, 10);
    expect(zoomForPxPerWorld(pxPerWorld(3.7, H), H)).toBeCloseTo(3.7, 10);
    expect(coverCssPx(zoomForCoverPx(24, H), H)).toBeCloseTo(24, 10);
  });

  it("sizes covers at about 1.4x the median neighbour gap", () => {
    expect(COVER_WORLD / MEDIAN_NEIGHBOUR_GAP).toBeGreaterThan(1.3);
    expect(COVER_WORLD / MEDIAN_NEIGHBOUR_GAP).toBeLessThan(1.5);
  });

  it("cross-fades between 16 and 32 px", () => {
    expect(coverFade(zoomForCoverPx(15.9, H), H)).toBe(0);
    expect(coverFade(zoomForCoverPx(24, H), H)).toBeCloseTo(0.5, 6);
    expect(coverFade(zoomForCoverPx(COVER_FADE_END_PX, H), H)).toBe(1);
  });

  it("leaves about 100 px between median neighbours at the maximum zoom", () => {
    const gap = MEDIAN_NEIGHBOUR_GAP * pxPerWorld(MAX_ZOOM, H);
    expect(gap).toBeGreaterThan(95);
    expect(gap).toBeLessThan(130);
  });

  it("grows dots gently with the map scale, from 3 px to about 7 px as covers start, at most 7.2", () => {
    expect(dotCssPx(0.784, H)).toBeCloseTo(3.09, 2);
    expect(dotCssPx(0.1, H)).toBe(3);
    expect(dotCssPx(2, H)).toBeGreaterThan(dotCssPx(0.784, H));
    expect(dotCssPx(zoomForCoverPx(16, H), H)).toBeCloseTo(6.88, 2);
    expect(dotCssPx(zoomForCoverPx(32, H), H)).toBe(7.2);
  });
});

describe("visibleScale", () => {
  it("is the visible height over the canvas height, and 1 with nothing over the canvas", () => {
    expect(visibleScale(900, 0)).toBe(1);
    expect(visibleScale(900, 64)).toBeCloseTo(836 / 900, 12);
    expect(visibleScale(844, 60)).toBeCloseTo(784 / 844, 12);
    // A canvas that has not been measured yet: never zero or negative.
    expect(visibleScale(0, 64)).toBe(0.5);
  });

  it("keeps a zoom limit the same size on screen", () => {
    expect(pxPerWorld(MAX_ZOOM * visibleScale(900, 64), 900)).toBeCloseTo(pxPerWorld(MAX_ZOOM, 836), 8);
    expect(pxPerWorld(MAX_ZOOM * visibleScale(844, 60), 844)).toBeCloseTo(pxPerWorld(MAX_ZOOM, 784), 8);
  });
});
