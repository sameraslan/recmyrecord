import { describe, expect, it } from "vitest";

import type { MapData } from "../data";
import {
  cloudCenter,
  fitZoom,
  getCloudBounds,
  nudgeVector,
  percentileBounds,
  viewportWorldRect,
  visibleFractionThreshold,
} from "./bounds";

function fixtureData(xy: Array<[number, number]>): MapData {
  const flat = new Float32Array(xy.flat());
  return { n: xy.length, albums: [], pos: { sonic: flat, balanced: flat, mood: flat }, atlasUrls: [] };
}

/** Flat [x0, y0, x1, y1, ...] array, the layout AlbumField's positionsRef uses. */
function flat(points: [number, number][]): Float32Array {
  const out = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => {
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  });
  return out;
}

/** 100 points: 99 on a regular 0..0.98 diagonal, plus one far outlier at (50, -50). */
function gridWithOutlier(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < 99; i++) pts.push([i / 100, i / 100]);
  pts.push([50, -50]);
  return pts;
}

describe("viewportWorldRect", () => {
  it("computes half-width/half-height in world units from the camera's frustum and zoom", () => {
    const cam = { left: -0.75, right: 0.75, top: 0.55, bottom: -0.55, zoom: 2.4 };
    const vp = viewportWorldRect(cam);
    expect(vp.halfW).toBeCloseTo(1.5 / 2.4 / 2, 10);
    expect(vp.halfH).toBeCloseTo(1.1 / 2.4 / 2, 10);
  });

  it("shrinks as zoom increases", () => {
    const base = { left: -0.75, right: 0.75, top: 0.55, bottom: -0.55, zoom: 1 };
    const zoomedIn = { ...base, zoom: 4 };
    const vpBase = viewportWorldRect(base);
    const vpZoomed = viewportWorldRect(zoomedIn);
    expect(vpZoomed.halfW).toBeLessThan(vpBase.halfW);
    expect(vpZoomed.halfH).toBeLessThan(vpBase.halfH);
  });
});

describe("percentileBounds", () => {
  it("ignores a single outlier out of 100 points", () => {
    const b = percentileBounds(flat(gridWithOutlier()), 0.02, 0.98);
    // Sorted xs: 0, 0.01, ..., 0.98, 50. p2 = xs[floor(0.02 * 99)] = xs[1]
    // = 0.01 and p98 = xs[floor(0.98 * 99)] = xs[97] = 0.97; the outlier at
    // x = 50 (index 99) never enters the box. Sorted ys: -50, 0, 0.01, ...,
    // so p2 = ys[1] = 0 and p98 = ys[97] = 0.96.
    expect(b.minX).toBeCloseTo(0.01, 6);
    expect(b.maxX).toBeCloseTo(0.97, 6);
    expect(b.minY).toBeCloseTo(0, 6);
    expect(b.maxY).toBeCloseTo(0.96, 6);
  });

  it("defaults to 3rd/97th percentiles, which clear an outlier group of 2.5%", () => {
    // 195 bulk points on a 0..0.97 diagonal plus 5 (2.5%) far outliers, the
    // shape of the real data at sliderT 0.5 (2.45% of the albums far out).
    const pts: [number, number][] = [];
    for (let i = 0; i < 195; i++) pts.push([i / 200, i / 200]);
    for (let i = 0; i < 5; i++) pts.push([-3.7, -2.3]);
    const b = percentileBounds(flat(pts));
    // Sorted xs: five -3.7 then 0, 0.005, ... p3 = xs[floor(0.03 * 199)] =
    // xs[5] = 0 (first bulk point); p97 = xs[193] = 188 / 200 = 0.94.
    expect(b.minX).toBeCloseTo(0, 6);
    expect(b.maxX).toBeCloseTo(0.94, 6);
    expect(b.minY).toBeCloseTo(0, 6);
    // p2 would be xs[floor(0.02 * 199)] = xs[3] = -3.7, inside the outliers.
    expect(percentileBounds(flat(pts), 0.02, 0.98).minX).toBeCloseTo(-3.7, 6);
  });

  it("does not reorder the caller's array", () => {
    const xy = flat([
      [3, 1],
      [1, 3],
      [2, 2],
    ]);
    const copy = Array.from(xy);
    percentileBounds(xy);
    expect(Array.from(xy)).toEqual(copy);
  });

  it("returns a zero box for an empty array", () => {
    expect(percentileBounds(new Float32Array(0))).toEqual({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  });
});

describe("getCloudBounds", () => {
  it("is the percentile box of the interpolated positions", () => {
    const pts = gridWithOutlier();
    expect(getCloudBounds(fixtureData(pts), 0.6)).toEqual(percentileBounds(flat(pts)));
  });
});

describe("cloudCenter", () => {
  it("is the midpoint of the percentile bounds, not of the raw extent", () => {
    const c = cloudCenter(percentileBounds(flat(gridWithOutlier()), 0.02, 0.98));
    // Percentile box x [0.01, 0.97], y [0, 0.96]. The raw min/max extent
    // would instead put the centre near (25, -25) because of the outlier.
    expect(c.x).toBeCloseTo(0.49, 6);
    expect(c.y).toBeCloseTo(0.48, 6);
  });
});

describe("fitZoom", () => {
  const frustum = { left: -0.75, right: 0.75, top: 0.55, bottom: -0.55 };

  it("fits a known rectangle on its tighter axis with an 8% margin per side", () => {
    // 1.0 x 0.5 cloud, padded to 1.16 x 0.58. zoomX = 1.5 / 1.16 = 1.2931,
    // zoomY = 1.1 / 0.58 = 1.8966, so the width is the tighter axis.
    const cloud = { minX: -0.5, maxX: 0.5, minY: -0.25, maxY: 0.25 };
    expect(fitZoom(cloud, frustum)).toBeCloseTo(1.5 / 1.16, 10);
  });

  it("uses the height when that is the tighter axis", () => {
    // 0.5 x 1.0 cloud: zoomX = 1.5 / 0.58 = 2.586, zoomY = 1.1 / 1.16 = 0.948.
    const cloud = { minX: -0.25, maxX: 0.25, minY: -0.5, maxY: 0.5 };
    expect(fitZoom(cloud, frustum)).toBeCloseTo(1.1 / 1.16, 10);
  });

  it("clamps to [0.5, 5]", () => {
    const huge = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const tiny = { minX: -0.001, maxX: 0.001, minY: -0.001, maxY: 0.001 };
    expect(fitZoom(huge, frustum)).toBe(0.5);
    expect(fitZoom(tiny, frustum)).toBe(5);
  });

  it("defaults margin to 0.08", () => {
    const cloud = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    expect(fitZoom(cloud, frustum)).toBeCloseTo(fitZoom(cloud, frustum, 0.08), 10);
  });
});

describe("nudgeVector", () => {
  const cloud = { minX: -0.4, maxX: 0.4, minY: -0.3, maxY: 0.3 };

  it("returns null when the cloud is already mostly visible (centered, zoomed to fit)", () => {
    const viewport = { halfW: 0.5, halfH: 0.4 };
    const camPos = { x: 0, y: 0 };
    expect(nudgeVector(camPos, viewport, cloud, 0.04)).toBeNull();
  });

  it("returns null for a small pan that still keeps most of the cloud in view", () => {
    // Viewport half-width 0.5 centered at x=0.3: view spans [-0.2, 0.8].
    // Cloud spans [-0.4, 0.4] (width 0.8); overlap is [-0.2, 0.4] = 0.6 wide,
    // 75% of the cloud's width, well above the 25% threshold.
    const viewport = { halfW: 0.5, halfH: 0.4 };
    const camPos = { x: 0.3, y: 0 };
    expect(nudgeVector(camPos, viewport, cloud, 0.04)).toBeNull();
  });

  it("returns null when zoomed out far enough that the cloud fits entirely inside the viewport", () => {
    // Old bug: a viewport bigger than the cloud used to force-recenter every
    // time. Zooming out to see everything must not be yanked back.
    const viewport = { halfW: 5, halfH: 5 };
    const camPos = { x: 0.35, y: -0.2 };
    expect(nudgeVector(camPos, viewport, cloud, 0.04)).toBeNull();
  });

  it("returns a correcting delta when the cloud is mostly out of view", () => {
    // Viewport half-width 0.1 (narrow) centered far to the right of the
    // cloud: essentially none of the cloud is visible.
    const viewport = { halfW: 0.1, halfH: 0.1 };
    const camPos = { x: 2, y: 0 };
    const delta = nudgeVector(camPos, viewport, cloud, 0.04);
    expect(delta).not.toBeNull();
    // Correction should pull the camera back toward the cloud (negative x).
    expect(delta!.x).toBeLessThan(0);
  });

  it("does not nudge while the correction would already sit within the eased margin", () => {
    // Camera already exactly at the clamp target: zero-length delta reads as
    // "no correction needed" (null), not a zero-vector nudge that would keep
    // frameloop='demand' rendering forever.
    const viewport = { halfW: 0.1, halfH: 0.1 };
    // loX = cloud.minX - margin + halfW = -0.4 - 0.04 + 0.1 = -0.34
    const camPos = { x: -0.34, y: 0 };
    expect(nudgeVector(camPos, viewport, cloud, 0.04)).toBeNull();
  });

  it("at or below fit zoom, nudges a view showing under 60% of the cloud even above 25%", () => {
    // Fit-sized viewport (0.5 x 0.4 half extents) offset so the view spans
    // x [-0.2, 0.8], y [-0.1, 0.7]: overlap 0.6 x 0.4 = 0.24 of the cloud's
    // 0.8 x 0.6 = 0.48 area, i.e. 50% coverage. Above the zoomed-in 25%
    // threshold (left alone), below the fit-zoom 60% threshold (nudged).
    const viewport = { halfW: 0.5, halfH: 0.4 };
    const camPos = { x: 0.3, y: 0.3 };
    expect(nudgeVector(camPos, viewport, cloud, 0.04)).toBeNull();
    const delta = nudgeVector(
      camPos,
      viewport,
      cloud,
      0.04,
      visibleFractionThreshold(1.007, 1.007),
    );
    expect(delta).not.toBeNull();
    // Viewport is larger than the padded box on both axes, so the target is
    // the box midpoint (0, 0): the correction points back toward it.
    expect(delta!.x).toBeCloseTo(-0.3, 10);
    expect(delta!.y).toBeCloseTo(-0.3, 10);
  });
});

describe("visibleFractionThreshold", () => {
  it("is 0.6 at or below the fitted zoom and 0.25 once zoomed in past it", () => {
    expect(visibleFractionThreshold(1.007, 1.007)).toBe(0.6);
    expect(visibleFractionThreshold(0.85, 1.007)).toBe(0.6);
    expect(visibleFractionThreshold(1.5, 1.007)).toBe(0.25);
    expect(visibleFractionThreshold(4, 1.007)).toBe(0.25);
  });

  it("tolerates float noise from the release glide landing on fitZoom", () => {
    expect(visibleFractionThreshold(1.0069727591127577, 1.0069727591127575)).toBe(0.6);
  });
});
