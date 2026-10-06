import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyFrustum, frustumCamera } from '../canvas/InitialFrame';
import { screenToWorld, worldToScreen } from './projection';
import { visibleScale } from './zoomLimits';

const rect = { left: 10, top: 20, width: 800, height: 500 };

function camera(insetPx: number, zoom: number, x: number, y: number, insetTopPx = 0): OrthographicCamera {
  const cam = new OrthographicCamera();
  cam.position.set(x, y, 5);
  cam.zoom = zoom;
  applyFrustum(cam, rect.width, rect.height, insetPx, insetTopPx);
  cam.updateMatrixWorld();
  return cam;
}

/** Where three.js itself draws a world point, in client pixels. */
function drawnAt(cam: OrthographicCamera, wx: number, wy: number): { x: number; y: number } {
  const v = new Vector3(wx, wy, 0).project(cam);
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

describe('screen and world conversions match three.js', () => {
  for (const [inset, zoom, top] of [[0, 1, 0], [0, 2.5, 0], [300, 1, 0], [300, 3.2, 0], [540, 0.8, 0], [0, 1, 64], [300, 3.2, 64], [0, 0.8, 120]] as const) {
    it(`agree with Vector3.project at inset ${inset} px, top inset ${top} px and zoom ${zoom}`, () => {
      const cam = camera(inset, zoom, 0.3, -0.2, top);
      for (const [wx, wy] of [[0.3, -0.2], [0.5, 0.1], [-0.4, 0.35]] as const) {
        const want = drawnAt(cam, wx, wy);
        const got = worldToScreen(wx, wy, rect, cam);
        expect(got.x).toBeCloseTo(want.x, 4);
        expect(got.y).toBeCloseTo(want.y, 4);
        const [bx, by] = screenToWorld(got.x, got.y, rect, cam);
        expect(bx).toBeCloseTo(wx, 6);
        expect(by).toBeCloseTo(wy, 6);
      }
    });
  }

  it('draws camera.position at the centre of the area right of the inset, at every zoom', () => {
    for (const zoom of [0.8, 1, 3.2]) {
      const p = drawnAt(camera(300, zoom, 1, 1), 1, 1);
      expect(p.x).toBeCloseTo(rect.left + 300 + (800 - 300) / 2, 4);
      expect(p.y).toBeCloseTo(rect.top + 250, 4);
    }
  });

  it('draws camera.position at the centre of the area below the header and right of the panel, at every zoom', () => {
    for (const zoom of [0.8, 1, 3.2]) {
      const p = drawnAt(camera(300, zoom, 1, 1, 64), 1, 1);
      expect(p.x).toBeCloseTo(rect.left + 300 + (800 - 300) / 2, 4);
      expect(p.y).toBeCloseTo(rect.top + 64 + (500 - 64) / 2, 4);
    }
  });

  it('keeps the world scale independent of the inset', () => {
    const a = camera(0, 2, 0, 0);
    const b = camera(300, 2, 0, 0);
    const span = (cam: OrthographicCamera) => drawnAt(cam, 0.2, 0).x - drawnAt(cam, 0, 0).x;
    expect(span(b)).toBeCloseTo(span(a), 6);
    // Nor of the top inset, along either axis.
    const c = camera(300, 2, 0, 0, 64);
    expect(span(c)).toBeCloseTo(span(a), 6);
    const rise = (cam: OrthographicCamera) => drawnAt(cam, 0, 0).y - drawnAt(cam, 0, 0.2).y;
    expect(rise(c)).toBeCloseTo(rise(a), 6);
  });

  it('a canvas taller by the header, with that top inset, shows below the inset what the shorter canvas showed', () => {
    // Two desktop cases (64 px header) and the phone (390 x 784 before, a 60 px header).
    for (const [W, H, TOP, inset, zoom] of [[800, 436, 64, 0, 1], [800, 436, 64, 300, 2.2], [390, 784, 60, 0, 0.4]] as const) {
      // Before: the canvas starts under the header and nothing covers it.
      const old = new OrthographicCamera();
      old.position.set(0.3, -0.2, 5);
      old.zoom = zoom;
      applyFrustum(old, W, H, inset, 0);
      // After: the canvas starts at the top of the window. The same size on screen is the zoom times visibleScale.
      const now = new OrthographicCamera();
      now.position.set(0.3, -0.2, 5);
      now.zoom = zoom * visibleScale(H + TOP, TOP);
      applyFrustum(now, W, H + TOP, inset, TOP);
      for (const [wx, wy] of [[0.3, -0.2], [0.5, 0.1], [-0.4, 0.35]] as const) {
        const a = worldToScreen(wx, wy, { left: 0, top: TOP, width: W, height: H }, old);
        const b = worldToScreen(wx, wy, { left: 0, top: 0, width: W, height: H + TOP }, now);
        expect(b.x).toBeCloseTo(a.x, 6);
        expect(b.y).toBeCloseTo(a.y, 6);
      }
    }
  });

  it('a camera that had a top inset and loses it draws as one that never had it', () => {
    const cam = camera(0, 1.7, 0.2, 0.1, 64);
    applyFrustum(cam, rect.width, rect.height, 0, 0);
    const plain = camera(0, 1.7, 0.2, 0.1);
    for (const [wx, wy] of [[0, 0], [0.31, -0.12]] as const) {
      expect(drawnAt(cam, wx, wy).y).toBeCloseTo(drawnAt(plain, wx, wy).y, 9);
      expect(worldToScreen(wx, wy, rect, cam).y).toBeCloseTo(worldToScreen(wx, wy, rect, plain).y, 9);
    }
  });
});

describe('frustumCamera', () => {
  it('projects as the camera does once applyFrustum and the view are applied', () => {
    // The five cases without a top inset, as before; then the header's two heights, alone and with a panel, and one
    // past the clamp (half the canvas).
    for (const [inset, zoom, x, y, top] of [[0, 1, 0, 0, 0], [0, 2.5, 0.1, -0.2, 0], [300, 3.2, -0.3, 0.05, 0], [540, 0.8, 0.2, 0.2, 0], [1000, 1.5, 0, 0, 0], [0, 1, 0, 0, 60], [0, 2.5, 0.1, -0.2, 64], [300, 3.2, -0.3, 0.05, 64], [540, 0.8, 0.2, 0.2, 60], [1000, 1.5, 0, 0, 400]] as const) {
      const cam = camera(inset, zoom, x, y, top);
      const like = frustumCamera({ x, y, zoom }, rect.width, rect.height, inset, top);
      for (const [wx, wy] of [[0, 0], [0.31, -0.12], [-0.4, 0.27]]) {
        const a = worldToScreen(wx, wy, rect, cam);
        const b = worldToScreen(wx, wy, rect, like);
        expect(b.x).toBeCloseTo(a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
      }
      // And by itself: the view's own position lands at the centre of the area right of the panel and below the
      // header (each inset clamped as applyFrustum clamps it: 0.9 of the width, half the height).
      const at = worldToScreen(x, y, rect, like);
      const left = Math.min(inset, rect.width * 0.9);
      const down = Math.min(top, rect.height * 0.5);
      expect(at.x).toBeCloseTo(rect.left + left + (rect.width - left) / 2, 9);
      expect(at.y).toBeCloseTo(rect.top + down + (rect.height - down) / 2, 9);
    }
  });
});
