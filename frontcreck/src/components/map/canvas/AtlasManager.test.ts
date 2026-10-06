import { describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({ useFrame: vi.fn(), useThree: vi.fn() }));

import { ATLAS_LOAD_PX, COVER_FADE_START_PX, zoomForCoverPx } from "../state/zoomLimits";
import { UPLOAD_BANDS, coversNear, uploadBands } from "./AtlasManager";

describe("when atlas sheets are worth loading", () => {
  const H = 836;
  it("is from a little before covers start to show, at any canvas height", () => {
    expect(coversNear(0.784, H)).toBe(false); // the fitted overview
    expect(coversNear(zoomForCoverPx(ATLAS_LOAD_PX, H) * 0.99, H)).toBe(false);
    expect(coversNear(zoomForCoverPx(ATLAS_LOAD_PX, H), H)).toBe(true);
    expect(coversNear(zoomForCoverPx(COVER_FADE_START_PX, H), H)).toBe(true);
    expect(coversNear(zoomForCoverPx(ATLAS_LOAD_PX, 400), 400)).toBe(true);
    expect(coversNear(zoomForCoverPx(ATLAS_LOAD_PX, H), 400)).toBe(false);
  });
});

describe("the bands a sheet is uploaded in", () => {
  it("cover every row of the sheet once, in order", () => {
    const bands = uploadBands(3072);
    expect(bands).toHaveLength(UPLOAD_BANDS);
    expect(bands).toEqual([[0, 768], [768, 1536], [1536, 2304], [2304, 3072]]);
    for (const h of [1, 3, 97, 3072, 4096]) {
      const b = uploadBands(h);
      expect(b[0][0]).toBe(0);
      expect(b[b.length - 1][1]).toBe(h);
      for (let i = 1; i < b.length; i++) expect(b[i][0]).toBe(b[i - 1][1]);
      for (const [y0, y1] of b) expect(y1).toBeGreaterThan(y0);
    }
  });
});
