import { describe, expect, it } from "vitest";

import { MAP_OPENS_AT, getFitCamera, getFitKind, getOverviewFraming, openingKind, releaseView, setFitKind, setOverviewFraming, snapKind, untouchedOverview } from "./view";

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

describe("openingKind (Task 0: /map opens at the Overview)", () => {
  const focus = { seed: 11, recs: [1, 2] };

  it("the one constant of the ruling says Overview", () => {
    expect(MAP_OPENS_AT).toBe("overview");
  });

  it("opens /map at the Overview when no album is in focus", () => {
    expect(openingKind({ explore: true, focus: null })).toBe("overview");
  });

  it("opens every other route at the Whole map, as today: Home, About, 404 and an album link", () => {
    expect(openingKind({ explore: false, focus: null })).toBe("whole");
    expect(openingKind({ explore: false, focus })).toBe("whole");
    // an album in focus always frames itself from the Whole map, whatever the route says
    expect(openingKind({ explore: true, focus })).toBe("whole");
  });

  it("takes the test switch on /map only, and ignores anything else in it", () => {
    expect(openingKind({ explore: true, focus: null }, "whole")).toBe("whole");
    expect(openingKind({ explore: true, focus: null }, "overview")).toBe("overview");
    expect(openingKind({ explore: false, focus: null }, "overview")).toBe("whole");
    expect(openingKind({ explore: false, focus }, "overview")).toBe("whole");
    for (const junk of [undefined, null, "", "WHOLE", 1, {}]) expect(openingKind({ explore: true, focus: null }, junk)).toBe("overview");
  });
});

describe("the Whole map stays the published fit (fit button, zoom-out floor, idle nudge)", () => {
  it("setFitKind does not touch the published whole-map framing", () => {
    const whole = { zoom: 0.785, center: { x: 0.157, y: -0.14 }, bounds: { minX: -0.42, maxX: 0.74, minY: -0.65, maxY: 0.47 } };
    setOverviewFraming(whole);
    setFitKind("overview");
    expect(getOverviewFraming()).toBe(whole);
    expect(getFitKind()).toBe("overview");
    setFitKind("whole");
    expect(getFitKind()).toBe("whole");
    expect(getFitCamera()).toBeNull();
    setFitKind("overview", { x: 0.033, y: 0, zoom: 2.157 });
    expect(getFitCamera()).toEqual({ x: 0.033, y: 0, zoom: 2.157 });
  });
});

describe("untouchedOverview (/map to Home shows the Whole map only while the Overview is untouched)", () => {
  const opened = { x: 0.033325, y: 0, zoom: 2.15721 };

  it("is true while the camera is where the Overview put it", () => {
    expect(untouchedOverview("overview", opened, { ...opened })).toBe(true);
    expect(untouchedOverview("overview", opened, { x: opened.x + 1e-8, y: opened.y, zoom: opened.zoom })).toBe(true);
  });

  it("is false once anything moved the camera: a pan, a zoom, a pick's fly", () => {
    expect(untouchedOverview("overview", opened, { ...opened, x: opened.x + 0.001 })).toBe(false);
    expect(untouchedOverview("overview", opened, { ...opened, y: opened.y - 0.001 })).toBe(false);
    expect(untouchedOverview("overview", opened, { ...opened, zoom: opened.zoom * 1.4 })).toBe(false);
  });

  it("is false at the Whole map (the fit button, or a page that opened there) and when nothing was recorded", () => {
    expect(untouchedOverview("whole", opened, { ...opened })).toBe(false);
    expect(untouchedOverview("overview", null, { ...opened })).toBe(false);
  });
});

describe("snapKind (InitialFrame: which framing a snap applies)", () => {
  const map = { explore: true, focus: null };
  const home = { explore: false, focus: null };

  it("a page load opens at the route's framing (openingKind)", () => {
    setFitKind("whole");
    expect(snapKind(true, map)).toBe("overview");
    expect(snapKind(true, map, "whole")).toBe("whole");
    expect(snapKind(true, home)).toBe("whole");
  });

  it("a resize on /map re-fits the framing last applied", () => {
    setFitKind("overview");
    expect(snapKind(false, map)).toBe("overview");
    setFitKind("whole");
    expect(snapKind(false, map)).toBe("whole");
  });

  it("a resize off /map always re-fits the Whole map, even while the last framing applied was the Overview (a pick's fly, then Home)", () => {
    setFitKind("overview", { x: 0.033, y: 0, zoom: 2.157 });
    expect(snapKind(false, home)).toBe("whole");
    expect(snapKind(false, home, "overview")).toBe("whole");
  });
});
