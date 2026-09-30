import { describe, expect, it } from "vitest";

import { anchoredZoom, MAX_ZOOM, MIN_ZOOM, pinchZoom } from "./zoomMath";

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
