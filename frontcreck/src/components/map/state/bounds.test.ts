import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildMapData, type MapData } from "../data";
import { GAS_BAND_FULL_PX } from "../theme";
import {
  coveredBottomPx,
  OVERVIEW_COVER_MAX_PX,
  OVERVIEW_NARROW_CLOSER,
  OVERVIEW_NARROW_COVER_PX,
  OVERVIEW_SIDE_PAD_PX,
  cloudCenter,
  fitOverview,
  fitView,
  getCloudBounds,
  interpolatedPositions,
  nudgeVector,
  overviewExtent,
  overviewView,
  percentileBounds,
  viewportWorldRect,
  visibleFractionThreshold,
} from "./bounds";
import { ATLAS_LOAD_PX, COVER_WORLD, FIT_ZOOM_MAX, FIT_ZOOM_MIN, MAX_ZOOM, pxPerWorld, zoomForPxPerWorld } from "./zoomLimits";

function fixtureData(xy: Array<[number, number]>): MapData {
  const flat = new Float32Array(xy.flat());
  return { n: xy.length, albums: [], pos: { sonic: flat, balanced: flat, mood: flat }, atlasUrls: [], tx: { cx: 0, cy: 0, s: 1 } };
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
  it("is the full extent of the interpolated positions, outliers included", () => {
    const pts = gridWithOutlier();
    const b = getCloudBounds(fixtureData(pts), 0.6);
    expect(b.minX).toBe(0);
    expect(b.maxX).toBe(50);
    expect(b.minY).toBe(-50);
    expect(b.maxY).toBeCloseTo(0.98, 6);
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

describe("fitView", () => {
  const even = { top: 0, right: 0, bottom: 0, left: 0 };

  it("fits the box on its tighter axis", () => {
    // 1.0 x 0.5 cloud on 1000 x 1100 px: 1000 px per world unit across, 2200 down, so the width
    // limits: zoom = 1000 * 1.1 / 1100 = 1.
    const cloud = { minX: -0.5, maxX: 0.5, minY: -0.25, maxY: 0.25 };
    const v = fitView(cloud, { width: 1000, height: 1100, insetLeft: 0, insetTop: 0, padding: even });
    expect(v.zoom).toBeCloseTo(1, 10);
    expect(v.center).toEqual({ x: 0, y: 0 });
  });

  it("keeps the padding clear and centres the box in the padded area", () => {
    const cloud = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const pad = { top: 100, right: 40, bottom: 200, left: 40 };
    const v = fitView(cloud, { width: 1000, height: 1100, insetLeft: 0, insetTop: 0, padding: pad });
    // 800 px available both ways: 800 px per world unit, zoom = 800 * 1.1 / 1100.
    expect(v.zoom).toBeCloseTo(0.8, 10);
    // Bottom padding is 100 px larger, so the camera sits 50 px (1/16 world unit) below the box centre.
    expect(v.center.x).toBeCloseTo(0.5, 10);
    expect(v.center.y).toBeCloseTo(0.5 - 50 / 800, 10);
  });

  it("fits only the area right of the album panel", () => {
    const cloud = { minX: 0, maxX: 1, minY: 0, maxY: 0.1 };
    const a = fitView(cloud, { width: 1000, height: 1100, insetLeft: 0, insetTop: 0, padding: even });
    const b = fitView(cloud, { width: 1000, height: 1100, insetLeft: 500, insetTop: 0, padding: even });
    expect(b.zoom).toBeCloseTo(a.zoom / 2, 10);
  });

  it("clamps the zoom to the fit range", () => {
    const huge = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const tiny = { minX: -0.001, maxX: 0.001, minY: -0.001, maxY: 0.001 };
    expect(fitView(huge, { width: 400, height: 800, insetLeft: 0, insetTop: 0, padding: even }).zoom).toBe(FIT_ZOOM_MIN);
    expect(fitView(tiny, { width: 400, height: 800, insetLeft: 0, insetTop: 0, padding: even }).zoom).toBe(FIT_ZOOM_MAX);
  });

  it("fits below a top inset exactly as on a canvas that starts under the header", () => {
    const cloud = { minX: -0.4, maxX: 0.7, minY: -0.5, maxY: 0.3 };
    const pad = { top: 55, right: 40, bottom: 115, left: 40 };
    const before = fitView(cloud, { width: 1440, height: 836, insetLeft: 0, insetTop: 0, padding: pad });
    const after = fitView(cloud, { width: 1440, height: 900, insetLeft: 0, insetTop: 64, padding: pad });
    // The same px per world unit (832.5) and the same camera centre: the camera is drawn at the centre of the
    // visible area in both.
    expect(pxPerWorld(before.zoom, 836)).toBeCloseTo(832.5, 8);
    expect(pxPerWorld(after.zoom, 900)).toBeCloseTo(832.5, 8);
    expect(after.center.x).toBeCloseTo(before.center.x, 10);
    expect(after.center.y).toBeCloseTo(before.center.y, 10);
    // The phone: a 390 x 784 canvas before, 390 x 844 with the 60 px header over it, the phone's overview padding.
    const phonePad = { top: 90, right: 40, bottom: 169, left: 40 };
    const phoneBefore = fitView(cloud, { width: 390, height: 784, insetLeft: 0, insetTop: 0, padding: phonePad });
    const phoneAfter = fitView(cloud, { width: 390, height: 844, insetLeft: 0, insetTop: 60, padding: phonePad });
    expect(pxPerWorld(phoneAfter.zoom, 844)).toBeCloseTo(pxPerWorld(phoneBefore.zoom, 784), 8);
    expect(phoneAfter.center.x).toBeCloseTo(phoneBefore.center.x, 10);
    expect(phoneAfter.center.y).toBeCloseTo(phoneBefore.center.y, 10);
  });

  it("keeps the fit clamp the same size on screen under a top inset", () => {
    const tiny = { minX: -0.001, maxX: 0.001, minY: -0.001, maxY: 0.001 };
    const huge = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    for (const [cloud, limit] of [[tiny, FIT_ZOOM_MAX], [huge, FIT_ZOOM_MIN]] as const) {
      const before = fitView(cloud, { width: 400, height: 800, insetLeft: 0, insetTop: 0, padding: even }).zoom;
      const after = fitView(cloud, { width: 400, height: 864, insetLeft: 0, insetTop: 64, padding: even }).zoom;
      expect(before).toBe(limit);
      expect(pxPerWorld(after, 864)).toBeCloseTo(pxPerWorld(before, 800), 8);
    }
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

describe("nudgeVector under a bottom panel (phone: the slider panel and the picked album's card)", () => {
  // The real phone numbers: a 390 x 844 canvas with 60 px under the header, covers at 32 px.
  const H = 844;
  const VISIBLE = 784;
  const zoom = zoomForPxPerWorld(32 / COVER_WORLD, H);
  const ppw = pxPerWorld(zoom, H);
  const viewport = { halfW: 390 / 2 / ppw, halfH: VISIBLE / 2 / ppw };
  const cloud = { minX: -0.4219, maxX: 0.7355, minY: -0.6474, maxY: 0.4689 };
  const MARGIN = 0.04;
  /** Client y of a world y with the camera at `camY`: the camera is drawn at the middle of the visible map. */
  const screenY = (worldY: number, camY: number) => 60 + VISIBLE / 2 + (camY - worldY) * ppw;
  /** Where the camera comes to rest from `camY`. */
  const rest = (camY: number, coveredPx: number) => camY + (nudgeVector({ x: 0, y: camY }, viewport, cloud, MARGIN, 0.25, coveredPx / ppw)?.y ?? 0);

  it("without a panel an album at the lower edge is pulled to within the margin of the bottom edge (the fault)", () => {
    // Milestones (y -0.6271), centred by its fly-to: the pull leaves it 560 px down, under a card whose top is at 550.
    const y = screenY(-0.6271, rest(-0.6271, 0));
    expect(y).toBeGreaterThan(550);
  });

  it("with the card's cover the camera stays where the fly-to put it: Milestones and the lowest album stay centred", () => {
    const cover = 294 + 16; // the card and the slider under it, and the fly-to's 16 px
    for (const albumY of [-0.6271, cloud.minY]) {
      expect(rest(albumY, cover), `album at ${albumY}`).toBe(albumY);
      // 38 px is half the picked cover with its frame; the card's top is at 844 - 294.
      expect(screenY(albumY, rest(albumY, cover)) + 38).toBeLessThan(844 - 294);
    }
  });

  it("with the slider panel's cover the lowest album rests above the panel", () => {
    const cover = 165 + 4;
    expect(screenY(cloud.minY, rest(cloud.minY, cover)) + 16).toBeLessThan(844 - 165);
    // Still held: the camera can not leave the cloud downwards by more than the cover.
    const far = rest(cloud.minY - 1, cover);
    expect(far).toBeCloseTo(cloud.minY - MARGIN + viewport.halfH - cover / ppw, 10);
  });

  it("only widens the range: a camera at rest without a cover is at rest with one, and the upper limit is the same", () => {
    const loY = cloud.minY - MARGIN + viewport.halfH;
    const hiY = cloud.maxY + MARGIN - viewport.halfH;
    for (const camY of [loY, (loY + hiY) / 2, hiY]) expect(rest(camY, 310), `camera at ${camY}`).toBe(camY);
    expect(rest(cloud.maxY, 310)).toBeCloseTo(hiY, 10);
    expect(rest(cloud.maxY, 0)).toBeCloseTo(hiY, 10);
  });

  it("leaves the centring of a viewport taller than the cloud alone, and the coverage test too", () => {
    const tall = { halfW: 0.1, halfH: 2 };
    const a = nudgeVector({ x: 3, y: 0.5 }, tall, cloud, MARGIN, 0.25, 0);
    const b = nudgeVector({ x: 3, y: 0.5 }, tall, cloud, MARGIN, 0.25, 0.5);
    expect(b).toEqual(a);
    // Mostly in view: no nudge, with or without a cover.
    expect(nudgeVector({ x: 0.15, y: -0.09 }, { halfW: 0.6, halfH: 0.6 }, cloud, MARGIN, 0.25, 0.5)).toBeNull();
  });
});

describe("nudgeVector under a bottom panel in a short viewport (a phone on its side)", () => {
  // 844 x 390 with 60 px under the header: 330 px of map, of which the slider panel covers 165 and the card 294.
  const H = 390;
  const VISIBLE = 330;
  const cloud = { minX: -0.4219, maxX: 0.7355, minY: -0.6474, maxY: 0.4689 };
  const MARGIN = 0.04;
  /** Client y of the cloud's lowest album once a camera dragged far below the cloud has been pulled back. */
  const lowestAtRest = (coverPx: number, coveredPx: number, viewH = H, visible = VISIBLE) => {
    const ppw = pxPerWorld(zoomForPxPerWorld(coverPx / COVER_WORLD, viewH), viewH);
    const viewport = { halfW: 844 / 2 / ppw, halfH: visible / 2 / ppw };
    const from = cloud.minY - 5;
    const camY = from + (nudgeVector({ x: 0, y: from }, viewport, cloud, MARGIN, 0.25, coveredPx / ppw)?.y ?? 0);
    return 60 + visible / 2 + (camY - cloud.minY) * ppw;
  };

  it("above the slider panel the pull back leaves the cloud's lowest albums in view, not behind the header", () => {
    // The margin is 188 px at 32 px covers, more than the 161 px band above the panel: resting the lowest album a
    // margin above the panel would put every album behind the header and leave the band empty sky.
    for (const coverPx of [24, 32]) {
      const y = lowestAtRest(coverPx, 165 + 4);
      expect(y, `${coverPx} px covers`).toBeGreaterThanOrEqual(60 + (VISIBLE - 169) / 2 - 1e-6);
      expect(y, `${coverPx} px covers`).toBeLessThan(H - 165);
    }
    // Closer in, the margin alone already lets the camera rest lower than that: the panel adds nothing to it.
    expect(lowestAtRest(48, 165 + 4)).toBeCloseTo(lowestAtRest(48, 0), 6);
    expect(lowestAtRest(48, 165 + 4)).toBeGreaterThan(60);
  });

  it("above the card too: the lowest album rests in the strip between the header and the card", () => {
    const y = lowestAtRest(32, 294 + 16);
    expect(y).toBeGreaterThan(60);
    expect(y).toBeLessThan(H - 294);
  });

  it("never holds the camera tighter than without a panel, at any zoom", () => {
    for (const coverPx of [8, 16, 32, 64, 140]) {
      for (const covered of [169, 310]) {
        expect(lowestAtRest(coverPx, covered), `${coverPx} px covers, ${covered} px covered`).toBeLessThanOrEqual(lowestAtRest(coverPx, 0) + 1e-6);
        expect(lowestAtRest(coverPx, covered, 844, 784)).toBeLessThanOrEqual(lowestAtRest(coverPx, 0, 844, 784) + 1e-6);
      }
    }
  });

  it("on an upright phone the lowest album still rests the margin above the panel, up to the middle of the band", () => {
    // 32 px covers: the margin (188 px) is less than half the band (307 px), so it is the margin.
    expect(lowestAtRest(32, 169, 844, 784)).toBeCloseTo(844 - 169 - (MARGIN * 32) / COVER_WORLD, 6);
    // 64 px covers: the margin (376 px) is more than half the band, so the middle of the band.
    expect(lowestAtRest(64, 169, 844, 784)).toBeCloseTo(60 + (784 - 169) / 2, 6);
  });
});

describe("coveredBottomPx", () => {
  const pad = (bottom: number) => ({ top: 80, right: 60, bottom, left: 60 });

  it("is 0 on desktop, where no panel spans the map", () => {
    expect(coveredBottomPx({ bottomCover: 0, framePadding: pad(90) })).toBe(0);
  });

  it("on a phone is the line a pick's fly-to keeps an album above: the slider panel, or the card on it", () => {
    expect(coveredBottomPx({ bottomCover: 165, framePadding: pad(169) })).toBe(169);
    expect(coveredBottomPx({ bottomCover: 165, framePadding: pad(310) })).toBe(310);
    // Never less than the panel itself.
    expect(coveredBottomPx({ bottomCover: 165, framePadding: pad(96) })).toBe(165);
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

describe("overviewExtent", () => {
  it("reads the 1st and 99th percentile of x and the median y with the prototype's quantile rule", () => {
    // 101 points: x = 0..100 (shuffled), y = 100 - x. floor(0.01 * 100) = 1, floor(0.99 * 100) = 99, floor(0.5 * 100) = 50.
    const pts: [number, number][] = Array.from({ length: 101 }, (_, i) => [(i * 37) % 101, 100 - ((i * 37) % 101)]);
    expect(overviewExtent(flat(pts))).toEqual({ x1: 1, x99: 99, medY: 50 });
  });

  it("does not sort or change the caller's array", () => {
    const xy = flat([[3, 1], [1, 3], [2, 2]]);
    const copy = Float32Array.from(xy);
    overviewExtent(xy);
    expect(xy).toEqual(copy);
  });
});

describe("fitOverview (prototype Cam.fitOverview, camera.js L27-34)", () => {
  const ext = { x1: -0.4, x99: 0.6, medY: 0.1 };
  const area = { width: 1440, height: 836, insetLeft: 0, insetTop: 0, bottomCover: 0 };

  it("fills the width less 24 px a side with the 1st..99th percentile span, centred on it and on the median row", () => {
    const wholeZoom = zoomForPxPerWorld(500, 836);
    const v = fitOverview(ext, wholeZoom, area);
    // (1440 - 48) / 1.0 = 1392 px per world unit, under the 12.5 px cover cap (1838.2).
    expect(pxPerWorld(v.zoom, 836)).toBeCloseTo(1392, 6);
    expect(v.center.x).toBeCloseTo(0.1, 12);
    expect(v.center.y).toBeCloseTo(0.1, 12);
    expect(OVERVIEW_SIDE_PAD_PX).toBe(24);
  });

  it("is capped at 12.5 px covers, half a pixel under the full gas band", () => {
    expect(OVERVIEW_COVER_MAX_PX).toBe(GAS_BAND_FULL_PX - 0.5);
    expect(OVERVIEW_COVER_MAX_PX).toBe(12.5);
    const narrow = { x1: -0.1, x99: 0.1, medY: 0 }; // (1440 - 48) / 0.2 = 6960 px per world unit wanted
    const v = fitOverview(narrow, zoomForPxPerWorld(500, 836), area);
    expect(pxPerWorld(v.zoom, 836) * COVER_WORLD).toBeCloseTo(12.5, 9);
    // under the zoom at which cover sheets start to load, so the opening view fetches none
    expect(12.5).toBeLessThan(ATLAS_LOAD_PX);
  });

  it("never frames wider than the whole map: a narrow window keeps the whole map's scale", () => {
    const wide = { x1: -2, x99: 2, medY: 0 }; // (390 - 48) / 4 = 85.5 px per world unit, under the whole map's 200
    const v = fitOverview(wide, zoomForPxPerWorld(200, 784), { width: 390, height: 784, insetLeft: 0, insetTop: 0, bottomCover: 165 });
    expect(pxPerWorld(v.zoom, 784)).toBeCloseTo(200, 6);
  });

  it("on a phone sets the median row in the middle of the band above the slider panel", () => {
    const v = fitOverview(ext, zoomForPxPerWorld(100, 784), { width: 390, height: 784, insetLeft: 0, insetTop: 0, bottomCover: 165 });
    const ppw = pxPerWorld(v.zoom, 784); // (390 - 48) / 1.0 = 342 for the span, and a phone opens 1.8 times closer
    expect(ppw).toBeCloseTo(342 * 1.8, 6);
    // camera.position is the canvas centre (y 392 of 784); the median row sits at (784 - 165) / 2 = 309.5, 82.5 px higher.
    const medianRowScreenY = 784 / 2 - (ext.medY - v.center.y) * ppw;
    expect(medianRowScreenY).toBeCloseTo((784 - 165) / 2, 6);
    expect(v.center.x).toBeCloseTo(0.1, 12);
  });

  it("on a narrow window (the slider panel across the bottom) opens 1.8 times closer, so stars read apart, up to 5.2 px covers", () => {
    expect([OVERVIEW_NARROW_CLOSER, OVERVIEW_NARROW_COVER_PX]).toEqual([1.8, 5.2]);
    const phone = { width: 390, height: 784, insetLeft: 0, insetTop: 0, bottomCover: 165 };
    const whole = zoomForPxPerWorld(100, 784);
    const at = (a: typeof phone) => pxPerWorld(fitOverview(ext, whole, a).zoom, a.height);
    // 390 px: the span alone gives 342 px per world unit (2.3 px covers, where 10,467 stars fuse); 615.6 now.
    expect(at(phone)).toBeCloseTo(615.6, 6);
    // The same window with no panel across the bottom (a desktop) is as it was.
    expect(at({ ...phone, bottomCover: 0 })).toBeCloseTo(342, 6);
    // A larger phone, 500 px: 452 for the span, 813.6 at 1.8 times, held at 5.2 px covers (764.7).
    expect(at({ ...phone, width: 500 })).toBeCloseTo(5.2 / COVER_WORLD, 6);
    // A tablet, 880 px: the span alone is already closer than that (832), and stays.
    expect(at({ ...phone, width: 880 })).toBeCloseTo(832, 6);
    // Closer about the same point: the middle of the span, the median row in the middle of the band.
    const v = fitOverview(ext, whole, phone);
    expect(v.center.x).toBeCloseTo(0.1, 12);
    expect(784 / 2 - (ext.medY - v.center.y) * 615.6).toBeCloseTo((784 - 165) / 2, 6);
    // The 12.5 px cap and the Whole map's floor still hold on a narrow window.
    expect(at({ ...phone, width: 880 }) * COVER_WORLD).toBeLessThanOrEqual(12.5);
    expect(pxPerWorld(fitOverview({ x1: -2, x99: 2, medY: 0 }, zoomForPxPerWorld(200, 784), phone).zoom, 784)).toBeCloseTo(200, 6);
  });

  it("fits the width right of the album panel", () => {
    const a = fitOverview(ext, 0.2, area);
    const b = fitOverview(ext, 0.2, { ...area, insetLeft: 400 });
    expect(pxPerWorld(b.zoom, 836)).toBeCloseTo(1440 - 400 - 48, 6);
    expect(pxPerWorld(a.zoom, 836)).toBeCloseTo(1440 - 48, 6);
  });

  it("frames below a top inset exactly as on a canvas that starts under the header", () => {
    // Desktop (64 px header), the phone (60 px, its slider panel covering 165 px), a span the 12.5 px cap limits,
    // and one the Whole map limits.
    const narrow = { x1: -0.1, x99: 0.1, medY: -0.2 };
    const wide = { x1: -2, x99: 2, medY: 0.3 };
    for (const [e, W, H, TOP, cover, wholePpw] of [[ext, 1440, 836, 64, 0, 500], [ext, 390, 784, 60, 165, 100], [narrow, 1440, 836, 64, 0, 500], [wide, 390, 784, 60, 165, 200]] as const) {
      const before = fitOverview(e, zoomForPxPerWorld(wholePpw, H), { width: W, height: H, insetLeft: 0, insetTop: 0, bottomCover: cover });
      const after = fitOverview(e, zoomForPxPerWorld(wholePpw, H + TOP), { width: W, height: H + TOP, insetLeft: 0, insetTop: TOP, bottomCover: cover });
      expect(pxPerWorld(after.zoom, H + TOP)).toBeCloseTo(pxPerWorld(before.zoom, H), 8);
      expect(after.center.x).toBeCloseTo(before.center.x, 10);
      expect(after.center.y).toBeCloseTo(before.center.y, 10);
    }
  });

  it("keeps the zoom ceiling the same size on screen under a top inset", () => {
    // A Whole map already past the ceiling: the ceiling decides.
    const before = fitOverview(ext, 1000, { width: 1440, height: 836, insetLeft: 0, insetTop: 0, bottomCover: 0 });
    const after = fitOverview(ext, 1000, { width: 1440, height: 900, insetLeft: 0, insetTop: 64, bottomCover: 0 });
    expect(before.zoom).toBe(MAX_ZOOM);
    expect(pxPerWorld(after.zoom, 900)).toBeCloseTo(pxPerWorld(before.zoom, 836), 8);
  });
});

/** The committed catalogue and layouts: the scales Task 0 records are those of the real map. */
function realData(): MapData {
  const dir = path.resolve(process.cwd(), "public/data");
  const albums = JSON.parse(fs.readFileSync(path.join(dir, "albums.json"), "utf8"));
  const positions = JSON.parse(fs.readFileSync(path.join(dir, "positions.json"), "utf8"));
  return buildMapData(albums, positions);
}
const STOP_T = { sonic: 0, balanced: 0.5, mood: 1 } as const;
const DESKTOP_FIT = { top: 55, right: 40, bottom: 115, left: 40 }; // MapStage DESKTOP_FIT_PADDING
const PHONE_FIT = { top: 90, right: 40, bottom: 165 + 4, left: 40 }; // MapStage PHONE_FIT_PADDING with the fallback cover

// The scales below were recorded again on 7 October 2026 for the 10,467-album layouts (positions.json e3093d62c5e6):
// they are what these functions give on that data, pinned so that a change to the framing code shows. On the
// 4,081-album layouts they were whole 596.653 / 708.479 / 618.156 and Overview 1639.476 / 1534.717 / 1838.235 on
// desktop (balanced / sonic / mood). They go stale with positions.json, not with the theme.
// The phone's Overview scales are 1.8 times the span rule's 422.054 / 347.788 / 410.7 (OVERVIEW_NARROW_CLOSER, none
// of them held by the 5.2 px limit, which is 764.706); its Whole map and every desktop number are as recorded.
describe("the Overview on the real map (Task 0's recorded scales)", () => {
  const data = realData();
  const cases = [
    { name: "desktop 1440 x 900", width: 1440, height: 836, pad: DESKTOP_FIT, cover: 0, whole: { balanced: 504.782, sonic: 440.556, mood: 563.14 }, overview: { balanced: 1717.834, sonic: 1415.559, mood: 1671.621 } },
    { name: "phone 390 x 844", width: 390, height: 784, pad: PHONE_FIT, cover: 165, whole: { balanced: 283.21, sonic: 238.307, mood: 341.249 }, overview: { balanced: 759.697, sonic: 626.019, mood: 739.26 } },
  ] as const;

  for (const c of cases) {
    for (const stop of ["balanced", "sonic", "mood"] as const) {
      it(`${c.name}, ${stop}: whole ${c.whole[stop]} and Overview ${c.overview[stop]} px per world unit`, () => {
        const t = STOP_T[stop];
        const whole = fitView(getCloudBounds(data, t), { width: c.width, height: c.height, insetLeft: 0, insetTop: 0, padding: c.pad });
        expect(pxPerWorld(whole.zoom, c.height)).toBeCloseTo(c.whole[stop], 2);
        const ov = overviewView(data, t, { width: c.width, height: c.height, insetLeft: 0, insetTop: 0, bottomCover: c.cover }, whole.zoom);
        expect(pxPerWorld(ov.zoom, c.height)).toBeCloseTo(c.overview[stop], 2);
        // Covers stay dots and the gas is full: under 13 px everywhere, at most 12.5.
        expect(pxPerWorld(ov.zoom, c.height) * COVER_WORLD).toBeLessThanOrEqual(12.5 + 1e-9);
      });
    }
  }

  it("desktop Balanced: the camera the map opens at", () => {
    const whole = fitView(getCloudBounds(data, 0.5), { width: 1440, height: 836, insetLeft: 0, insetTop: 0, padding: DESKTOP_FIT });
    const ov = overviewView(data, 0.5, { width: 1440, height: 836, insetLeft: 0, insetTop: 0, bottomCover: 0 }, whole.zoom);
    expect(ov.zoom).toBeCloseTo(2.26031, 4);
    expect(ov.center.x).toBeCloseTo(0.138659, 5);
    expect(ov.center.y).toBeCloseTo(0, 6);
    // the Whole map (0.78507 on the 4,081-album layout, which part 2 quotes as 0.784 * 836 / 1.1 = 595.8)
    expect(whole.zoom).toBeCloseTo(0.66419, 4);
  });

  it("is never nudged by CameraBounds: the opening view is inside the padded cloud box at every window checked", () => {
    const sizes = [
      [1440, 836, 0], [1920, 1016, 0], [2560, 1376, 0], [1366, 704, 0], [1024, 704, 0], [900, 536, 0],
      [390, 784, 165], [360, 580, 165], [430, 872, 165], [844, 330, 165], [768, 964, 165],
    ] as const;
    for (const [w, h, cover] of sizes) {
      for (const stop of ["balanced", "sonic", "mood"] as const) {
        const t = STOP_T[stop];
        const cloud = getCloudBounds(data, t);
        const pad = cover ? { ...PHONE_FIT, bottom: cover + 4 } : DESKTOP_FIT;
        const whole = fitView(cloud, { width: w, height: h, insetLeft: 0, insetTop: 0, padding: pad });
        const ov = overviewView(data, t, { width: w, height: h, insetLeft: 0, insetTop: 0, bottomCover: cover }, whole.zoom);
        const halfH = 0.55 / ov.zoom; // FRUSTUM_HALF_HEIGHT / zoom
        const viewport = { halfW: halfH * (w / h), halfH };
        // CameraBounds' MARGIN (0.04) and its threshold above the fitted zoom
        expect(nudgeVector(ov.center, viewport, cloud, 0.04, visibleFractionThreshold(ov.zoom, whole.zoom)), `${w} x ${h} ${stop}`).toBeNull();
      }
    }
  });

  it("frames the same stop's own albums: the 1st and 99th percentile sit 24 px inside the sides on desktop", () => {
    const xy = interpolatedPositions(data, 0.5);
    const e = overviewExtent(xy);
    const whole = fitView(getCloudBounds(data, 0.5), { width: 1440, height: 836, insetLeft: 0, insetTop: 0, padding: DESKTOP_FIT });
    const ov = overviewView(data, 0.5, { width: 1440, height: 836, insetLeft: 0, insetTop: 0, bottomCover: 0 }, whole.zoom);
    const ppw = pxPerWorld(ov.zoom, 836);
    expect(720 + (e.x1 - ov.center.x) * ppw).toBeCloseTo(24, 6);
    expect(720 + (e.x99 - ov.center.x) * ppw).toBeCloseTo(1440 - 24, 6);
  });
});
