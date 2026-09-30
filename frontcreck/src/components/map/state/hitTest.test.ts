import { describe, expect, it } from "vitest";

import {
  cssPxToWorld,
  hitRadiusCssPx,
  nearestWithin,
  pickAlbum,
  spriteHitRadiusCssPx,
} from "./hitTest";

describe("nearestWithin", () => {
  it("returns the closest index inside the radius", () => {
    const positions = new Float32Array([0, 0, 1, 0, 2, 0]);
    expect(nearestWithin(positions, 3, 0.9, 0, 0.5)).toBe(1);
  });

  it("returns -1 when nothing is within the radius", () => {
    const positions = new Float32Array([0, 0, 5, 5]);
    expect(nearestWithin(positions, 2, 10, 10, 0.5)).toBe(-1);
  });

  it("returns -1 exactly at the radius boundary (strict inside only)", () => {
    const positions = new Float32Array([0, 0]);
    expect(nearestWithin(positions, 1, 1, 0, 1)).toBe(-1);
  });

  it("picks the first index on a tie", () => {
    // (1,0) and (-1,0) are both distance 1 from the origin.
    const positions = new Float32Array([1, 0, -1, 0]);
    expect(nearestWithin(positions, 2, 0, 0, 2)).toBe(0);
  });

  it("only considers the first n points even if the array is longer", () => {
    const positions = new Float32Array([10, 10, 0, 0]);
    expect(nearestWithin(positions, 1, 0, 0, 1)).toBe(-1);
  });
});

describe("hitRadiusCssPx", () => {
  it("is 14px for a mouse and 24px for touch or pen", () => {
    expect(hitRadiusCssPx("mouse")).toBe(14);
    expect(hitRadiusCssPx("touch")).toBe(24);
    expect(hitRadiusCssPx("pen")).toBe(24);
  });
});

describe("cssPxToWorld", () => {
  it("divides by CSS px per world unit (zoom * viewport height / frustum height)", () => {
    // 900 CSS px tall canvas, 2.2 world-unit frustum, zoom 1.
    expect(cssPxToWorld(14, 900, 1, 2.2)).toBeCloseTo((14 * 2.2) / 900, 10);
  });

  it("shrinks in world units as the camera zooms in", () => {
    const at1 = cssPxToWorld(14, 900, 1, 2.2);
    const at4 = cssPxToWorld(14, 900, 4, 2.2);
    expect(at4).toBeCloseTo(at1 / 4, 10);
  });

  it("round-trips: the world radius times px per unit gives back the CSS px", () => {
    const r = cssPxToWorld(24, 640, 2.5, 2.2);
    expect(r * ((2.5 * 640) / 2.2)).toBeCloseTo(24, 10);
  });
});

describe("spriteHitRadiusCssPx", () => {
  it("keeps the pointer minimum for small overview discs", () => {
    expect(spriteHitRadiusCssPx("mouse", 10)).toBe(14);
    expect(spriteHitRadiusCssPx("touch", 10)).toBe(24);
  });

  it("covers the whole drawn disc once it is larger than the minimum", () => {
    expect(spriteHitRadiusCssPx("mouse", 90)).toBe(45);
    expect(spriteHitRadiusCssPx("touch", 90)).toBe(45);
  });
});

describe("pickAlbum", () => {
  // Album 0 at the origin, album 1 at x=1: at x=0.6 album 1 is nearer.
  const positions = new Float32Array([0, 0, 1, 0]);

  it("falls back to the nearest centre without priority candidates", () => {
    expect(pickAlbum(positions, 2, 0.6, 0, 2, [])).toBe(1);
  });

  it("lets a priority album win anywhere inside its own disc", () => {
    expect(pickAlbum(positions, 2, 0.6, 0, 2, [{ index: 0, radiusWorld: 0.7 }])).toBe(0);
  });

  it("ignores a priority album when the point is outside its disc", () => {
    expect(pickAlbum(positions, 2, 0.6, 0, 2, [{ index: 0, radiusWorld: 0.5 }])).toBe(1);
  });

  it("checks candidates in order and skips index -1", () => {
    const priority = [
      { index: -1, radiusWorld: 9 },
      { index: 1, radiusWorld: 0.7 },
      { index: 0, radiusWorld: 0.7 },
    ];
    expect(pickAlbum(positions, 2, 0.5, 0, 2, priority)).toBe(1);
  });
});
