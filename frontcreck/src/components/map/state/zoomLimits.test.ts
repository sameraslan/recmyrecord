import { describe, expect, it } from "vitest";

import {
  COVER_FADE_END_PX,
  COVER_MAX_PX,
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
// The map of 10,467 albums, in world units (all three layouts).
const MEDIAN_NEIGHBOUR_GAP = 0.0032;
const GRID_STEP = 0.00077; // 0.001 layout units: the least distance between two albums
const PHONE_H = 784; // canvas of a 390 x 844 phone

describe("zoom limits", () => {
  it("converts between zoom and map scale both ways", () => {
    expect(pxPerWorld(1, 1100)).toBeCloseTo(1000, 10);
    expect(zoomForPxPerWorld(pxPerWorld(3.7, H), H)).toBeCloseTo(3.7, 10);
    expect(coverCssPx(zoomForCoverPx(24, H), H)).toBeCloseTo(24, 10);
  });

  it("sizes covers at about 2.1x the median neighbour gap", () => {
    expect(COVER_WORLD / MEDIAN_NEIGHBOUR_GAP).toBeGreaterThan(2);
    expect(COVER_WORLD / MEDIAN_NEIGHBOUR_GAP).toBeLessThan(2.3);
  });

  it("cross-fades between 16 and 32 px", () => {
    expect(coverFade(zoomForCoverPx(15.9, H), H)).toBe(0);
    expect(coverFade(zoomForCoverPx(24, H), H)).toBeCloseTo(0.5, 6);
    expect(coverFade(zoomForCoverPx(COVER_FADE_END_PX, H), H)).toBe(1);
  });

  it("at the maximum zoom one grid step clears a full cover, on a desktop and on a phone canvas", () => {
    expect(MAX_ZOOM).toBe(120);
    for (const h of [H, PHONE_H]) {
      expect(coverCssPx(MAX_ZOOM, h)).toBe(COVER_MAX_PX);
      // Two albums one step apart (the closest any two are) do not overlap at all.
      const step = GRID_STEP * pxPerWorld(MAX_ZOOM, h);
      expect(step).toBeGreaterThanOrEqual(COVER_MAX_PX);
      // And not much further in than that needs: under 10 px between the two covers.
      expect(step - COVER_MAX_PX).toBeLessThan(10);
    }
  });

  it("grows dots gently with the map scale, from 3 px to about 7 px as covers start, at most 7.2", () => {
    expect(dotCssPx(0.784, H)).toBeCloseTo(3.09, 2);
    expect(dotCssPx(0.1, H)).toBe(3);
    expect(dotCssPx(2, H)).toBeGreaterThan(dotCssPx(0.784, H));
    expect(dotCssPx(zoomForCoverPx(16, H), H)).toBeCloseTo(6.88, 2);
    expect(dotCssPx(zoomForCoverPx(32, H), H)).toBe(7.2);
  });
});
