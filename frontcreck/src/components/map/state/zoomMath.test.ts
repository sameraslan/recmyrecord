import { describe, expect, it } from "vitest";

import { anchoredZoom, flingStopSpeedSq, FLING_STOP_REF_ZOOM, FLING_STOP_SPEED, MAX_ZOOM, MIN_ZOOM, pinchZoom, tweenCoord, tweenZoom } from "./zoomMath";
import { COVER_FADE_END_PX, coverCssPx, pxPerWorld, zoomForCoverPx } from "./zoomLimits";

/** Orthographic screen offset from centre, in the camera's frustum units. */
function project(world: [number, number], cam: { x: number; y: number; zoom: number }) {
  return [(world[0] - cam.x) * cam.zoom, (world[1] - cam.y) * cam.zoom];
}

describe("anchoredZoom", () => {
  it("keeps the cursor's world point projecting to the same screen point after a zoom change", () => {
    const cam = { x: 0, y: 0, zoom: 2 };
    const cursorWorld: [number, number] = [0.2, 0.1];
    const nextZoom = 4;

    const before = project(cursorWorld, cam);
    const nextPos = anchoredZoom(cam, cursorWorld, nextZoom);
    const after = project(cursorWorld, { x: nextPos.x, y: nextPos.y, zoom: nextZoom });

    expect(after[0]).toBeCloseTo(before[0], 10);
    expect(after[1]).toBeCloseTo(before[1], 10);
  });

  it("returns the cursor point unchanged when zoom does not change", () => {
    const cam = { x: 1, y: -0.5, zoom: 3 };
    const cursorWorld: [number, number] = [1.3, -0.2];
    const nextPos = anchoredZoom(cam, cursorWorld, cam.zoom);
    expect(nextPos.x).toBeCloseTo(cam.x, 10);
    expect(nextPos.y).toBeCloseTo(cam.y, 10);
  });

  it("handles zooming out (nextZoom < current zoom)", () => {
    const cam = { x: 0.4, y: 0.1, zoom: 3 };
    const cursorWorld: [number, number] = [0.6, -0.3];
    const nextZoom = 1;

    const before = project(cursorWorld, cam);
    const nextPos = anchoredZoom(cam, cursorWorld, nextZoom);
    const after = project(cursorWorld, { x: nextPos.x, y: nextPos.y, zoom: nextZoom });

    expect(after[0]).toBeCloseTo(before[0], 10);
    expect(after[1]).toBeCloseTo(before[1], 10);
  });
});

describe("pinchZoom", () => {
  it("scales startZoom by the ratio of current distance to start distance", () => {
    expect(pinchZoom(100, 200, 2)).toBeCloseTo(4, 10);
    expect(pinchZoom(200, 100, 2)).toBeCloseTo(1, 10);
    expect(pinchZoom(100, 100, 3)).toBeCloseTo(3, 10);
  });

  it("clamps the result to MAX_ZOOM when pinching out far", () => {
    expect(pinchZoom(10, 1000, 3)).toBe(MAX_ZOOM);
  });

  it("clamps the result to MIN_ZOOM when pinching in far", () => {
    expect(pinchZoom(1000, 10, 3)).toBe(MIN_ZOOM);
  });

  it("guards against a zero or negative start distance", () => {
    expect(pinchZoom(0, 100, 2)).toBe(MAX_ZOOM);
    expect(pinchZoom(-5, 100, 2)).toBe(MAX_ZOOM);
  });
});

describe("flingStopSpeedSq", () => {
  const pxPerFrame = (zoom: number, h = 836) => Math.sqrt(flingStopSpeedSq(zoom)) * pxPerWorld(zoom, h);

  it("is the constant it always was up to the reference zoom", () => {
    expect(FLING_STOP_SPEED).toBe(1e-5);
    for (const zoom of [0.2, 0.78, 5, 12.4, FLING_STOP_REF_ZOOM]) expect(flingStopSpeedSq(zoom)).toBe(FLING_STOP_SPEED ** 2);
  });

  it("past it ends a fling at the same speed on screen, up to the maximum zoom", () => {
    const atRef = pxPerFrame(FLING_STOP_REF_ZOOM);
    expect(atRef).toBeCloseTo(0.21, 2);
    for (const zoom of [40, 80, MAX_ZOOM]) expect(pxPerFrame(zoom)).toBeCloseTo(atRef, 10);
    // Without the scaling the map would stop at 0.9 px per frame at the maximum zoom.
    expect(1e-5 * pxPerWorld(MAX_ZOOM, 836)).toBeGreaterThan(0.9);
    expect(flingStopSpeedSq(MAX_ZOOM)).toBeGreaterThan(0);
  });
});

describe("tweenZoom and tweenCoord (a camera glide)", () => {
  it("a glide's zoom is a straight line in the logarithm, its position a straight line", () => {
    expect(tweenZoom(2, 8, 0)).toBe(2);
    expect(tweenZoom(2, 8, 0.5)).toBeCloseTo(4, 12);
    expect(tweenZoom(8, 2, 0.25)).toBeCloseTo(8 / Math.SQRT2, 12);
    expect(tweenCoord(0.1, 0.5, 0)).toBe(0.1);
    expect(tweenCoord(0.1, 0.5, 0.25)).toBeCloseTo(0.2, 12);
    expect(tweenCoord(0.5, -0.5, 0.5)).toBeCloseTo(0, 12);
  });

  it("ends on the target itself, whatever zoom the glide began at", () => {
    // A fly-to ends where covers are 32 px, the start of deep zoom (canvas/CameraTween.tsx flyTarget). The sum
    // in the logarithm can end one step of the float away from it: from zoom 2 on a 900 px canvas it gave
    // 5.751633986928106 for 5.7516339869281055, covers of 32.00000000000001 px, and the gas a first trace of
    // deep zoom at rest (gasCurve). Which starts miss depends on the catalog's opening zoom.
    const to = zoomForCoverPx(COVER_FADE_END_PX, 900);
    expect(Math.exp(Math.log(2) + (Math.log(to) - Math.log(2)) * 1), "the bare sum misses from this start").not.toBe(to);
    for (const from of [0.2, 0.66419, 2, (2.15721 * 836) / 900, (2.26031 * 836) / 900, 3.9453, 5]) {
      expect(tweenZoom(from, to, 1), `from ${from}`).toBe(to);
      expect(coverCssPx(tweenZoom(from, to, 1), 900), `covers after a glide from ${from}`).toBe(COVER_FADE_END_PX);
    }
    for (const [from, target] of [[0.1, 0.7], [0.13865870237350464, -0.33705245472233875], [1e-3, 0.1 + 0.2], [-0.4, 1 / 3]]) {
      expect(tweenCoord(from, target, 1), `from ${from}`).toBe(target);
    }
  });
});
