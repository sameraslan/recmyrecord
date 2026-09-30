import { describe, expect, it } from "vitest";

import {
  COVER_FADE_END_PX,
  COVER_WORLD,
  MAX_ZOOM,
  coverCssPx,
  coverFade,
  dotCssPx,
  pxPerWorld,
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

  it("grows dots gently with the map scale, up to 7.2 px as covers start", () => {
    expect(dotCssPx(0.784, H)).toBeCloseTo(5, 1);
    expect(dotCssPx(0.1, H)).toBeGreaterThan(3.7);
    expect(dotCssPx(0.1, H)).toBeLessThan(dotCssPx(0.784, H));
    expect(dotCssPx(zoomForCoverPx(16, H), H)).toBe(7.2);
  });
});
