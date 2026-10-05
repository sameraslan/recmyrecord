import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildMapData, type MapData } from "../data";
import { NAMES_BAND_PX } from "../theme";
import {
  OVERVIEW_COVER_MAX_PX,
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
import { ATLAS_LOAD_PX, COVER_WORLD, FIT_ZOOM_MAX, FIT_ZOOM_MIN, pxPerWorld, zoomForPxPerWorld } from "./zoomLimits";

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
    const v = fitView(cloud, { width: 1000, height: 1100, insetLeft: 0, padding: even });
    expect(v.zoom).toBeCloseTo(1, 10);
    expect(v.center).toEqual({ x: 0, y: 0 });
  });

  it("keeps the padding clear and centres the box in the padded area", () => {
    const cloud = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    const pad = { top: 100, right: 40, bottom: 200, left: 40 };
    const v = fitView(cloud, { width: 1000, height: 1100, insetLeft: 0, padding: pad });
    // 800 px available both ways: 800 px per world unit, zoom = 800 * 1.1 / 1100.
    expect(v.zoom).toBeCloseTo(0.8, 10);
    // Bottom padding is 100 px larger, so the camera sits 50 px (1/16 world unit) below the box centre.
    expect(v.center.x).toBeCloseTo(0.5, 10);
    expect(v.center.y).toBeCloseTo(0.5 - 50 / 800, 10);
  });

  it("fits only the area right of the album panel", () => {
    const cloud = { minX: 0, maxX: 1, minY: 0, maxY: 0.1 };
    const a = fitView(cloud, { width: 1000, height: 1100, insetLeft: 0, padding: even });
    const b = fitView(cloud, { width: 1000, height: 1100, insetLeft: 500, padding: even });
    expect(b.zoom).toBeCloseTo(a.zoom / 2, 10);
  });

  it("clamps the zoom to the fit range", () => {
    const huge = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const tiny = { minX: -0.001, maxX: 0.001, minY: -0.001, maxY: 0.001 };
    expect(fitView(huge, { width: 400, height: 800, insetLeft: 0, padding: even }).zoom).toBe(FIT_ZOOM_MIN);
    expect(fitView(tiny, { width: 400, height: 800, insetLeft: 0, padding: even }).zoom).toBe(FIT_ZOOM_MAX);
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
  const area = { width: 1440, height: 836, insetLeft: 0, bottomCover: 0 };

  it("fills the width less 24 px a side with the 1st..99th percentile span, centred on it and on the median row", () => {
    const wholeZoom = zoomForPxPerWorld(500, 836);
    const v = fitOverview(ext, wholeZoom, area);
    // (1440 - 48) / 1.0 = 1392 px per world unit, under the 12.5 px cover cap (1838.2).
    expect(pxPerWorld(v.zoom, 836)).toBeCloseTo(1392, 6);
    expect(v.center.x).toBeCloseTo(0.1, 12);
    expect(v.center.y).toBeCloseTo(0.1, 12);
    expect(OVERVIEW_SIDE_PAD_PX).toBe(24);
  });

  it("is capped at 12.5 px covers, half a pixel under the names band", () => {
    expect(OVERVIEW_COVER_MAX_PX).toBe(NAMES_BAND_PX - 0.5);
    expect(OVERVIEW_COVER_MAX_PX).toBe(12.5);
    const narrow = { x1: -0.1, x99: 0.1, medY: 0 }; // (1440 - 48) / 0.2 = 6960 px per world unit wanted
    const v = fitOverview(narrow, zoomForPxPerWorld(500, 836), area);
    expect(pxPerWorld(v.zoom, 836) * COVER_WORLD).toBeCloseTo(12.5, 9);
    // under the zoom at which cover sheets start to load, so the opening view fetches none
    expect(12.5).toBeLessThan(ATLAS_LOAD_PX);
  });

  it("never frames wider than the whole map: a narrow window keeps the whole map's scale", () => {
    const wide = { x1: -2, x99: 2, medY: 0 }; // (390 - 48) / 4 = 85.5 px per world unit, under the whole map's 200
    const v = fitOverview(wide, zoomForPxPerWorld(200, 784), { width: 390, height: 784, insetLeft: 0, bottomCover: 165 });
    expect(pxPerWorld(v.zoom, 784)).toBeCloseTo(200, 6);
  });

  it("on a phone sets the median row in the middle of the band above the slider panel", () => {
    const v = fitOverview(ext, zoomForPxPerWorld(100, 784), { width: 390, height: 784, insetLeft: 0, bottomCover: 165 });
    const ppw = pxPerWorld(v.zoom, 784); // (390 - 48) / 1.0 = 342
    expect(ppw).toBeCloseTo(342, 6);
    // camera.position is the canvas centre (y 392 of 784); the median row sits at (784 - 165) / 2 = 309.5, 82.5 px higher.
    const medianRowScreenY = 784 / 2 - (ext.medY - v.center.y) * ppw;
    expect(medianRowScreenY).toBeCloseTo((784 - 165) / 2, 6);
    expect(v.center.x).toBeCloseTo(0.1, 12);
  });

  it("fits the width right of the album panel", () => {
    const a = fitOverview(ext, 0.2, area);
    const b = fitOverview(ext, 0.2, { ...area, insetLeft: 400 });
    expect(pxPerWorld(b.zoom, 836)).toBeCloseTo(1440 - 400 - 48, 6);
    expect(pxPerWorld(a.zoom, 836)).toBeCloseTo(1440 - 48, 6);
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

describe("the Overview on the real map (Task 0's recorded scales)", () => {
  const data = realData();
  const cases = [
    { name: "desktop 1440 x 900", width: 1440, height: 836, pad: DESKTOP_FIT, cover: 0, whole: { balanced: 596.653, sonic: 708.479, mood: 618.156 }, overview: { balanced: 1639.476, sonic: 1534.717, mood: 1838.235 } },
    { name: "phone 390 x 844", width: 390, height: 784, pad: PHONE_FIT, cover: 165, whole: { balanced: 267.847, sonic: 286.498, mood: 487.285 }, overview: { balanced: 402.802, sonic: 377.064, mood: 584.842 } },
  ] as const;

  for (const c of cases) {
    for (const stop of ["balanced", "sonic", "mood"] as const) {
      it(`${c.name}, ${stop}: whole ${c.whole[stop]} and Overview ${c.overview[stop]} px per world unit`, () => {
        const t = STOP_T[stop];
        const whole = fitView(getCloudBounds(data, t), { width: c.width, height: c.height, insetLeft: 0, padding: c.pad });
        expect(pxPerWorld(whole.zoom, c.height)).toBeCloseTo(c.whole[stop], 2);
        const ov = overviewView(data, t, { width: c.width, height: c.height, insetLeft: 0, bottomCover: c.cover }, whole.zoom);
        expect(pxPerWorld(ov.zoom, c.height)).toBeCloseTo(c.overview[stop], 2);
        // Covers stay dots and names show: under 13 px everywhere, at most 12.5.
        expect(pxPerWorld(ov.zoom, c.height) * COVER_WORLD).toBeLessThanOrEqual(12.5 + 1e-9);
      });
    }
  }

  it("desktop Balanced: the camera the map opens at", () => {
    const whole = fitView(getCloudBounds(data, 0.5), { width: 1440, height: 836, insetLeft: 0, padding: DESKTOP_FIT });
    const ov = overviewView(data, 0.5, { width: 1440, height: 836, insetLeft: 0, bottomCover: 0 }, whole.zoom);
    expect(ov.zoom).toBeCloseTo(2.15721, 4);
    expect(ov.center.x).toBeCloseTo(0.033325, 5);
    expect(ov.center.y).toBeCloseTo(0, 6);
    // the Whole map, unchanged from today (part 2 quotes 0.784 * 836 / 1.1 = 595.8, the zoom rounded)
    expect(whole.zoom).toBeCloseTo(0.78507, 4);
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
        const whole = fitView(cloud, { width: w, height: h, insetLeft: 0, padding: pad });
        const ov = overviewView(data, t, { width: w, height: h, insetLeft: 0, bottomCover: cover }, whole.zoom);
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
    const whole = fitView(getCloudBounds(data, 0.5), { width: 1440, height: 836, insetLeft: 0, padding: DESKTOP_FIT });
    const ov = overviewView(data, 0.5, { width: 1440, height: 836, insetLeft: 0, bottomCover: 0 }, whole.zoom);
    const ppw = pxPerWorld(ov.zoom, 836);
    expect(720 + (e.x1 - ov.center.x) * ppw).toBeCloseTo(24, 6);
    expect(720 + (e.x99 - ov.center.x) * ppw).toBeCloseTo(1440 - 24, 6);
  });
});
