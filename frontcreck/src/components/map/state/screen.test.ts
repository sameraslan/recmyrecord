import { OrthographicCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyFrustum } from '../canvas/InitialFrame';
import { screenToWorld, worldToScreen } from './projection';

const rect = { left: 10, top: 20, width: 800, height: 500 };

function camera(insetPx: number, zoom: number, x: number, y: number): OrthographicCamera {
  const cam = new OrthographicCamera();
  cam.position.set(x, y, 5);
  cam.zoom = zoom;
  applyFrustum(cam, rect.width, rect.height, insetPx);
  cam.updateMatrixWorld();
  return cam;
}

/** Where three.js itself draws a world point, in client pixels. */
function drawnAt(cam: OrthographicCamera, wx: number, wy: number): { x: number; y: number } {
  const v = new Vector3(wx, wy, 0).project(cam);
  return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
}

describe('screen and world conversions match three.js', () => {
  for (const [inset, zoom] of [[0, 1], [0, 2.5], [300, 1], [300, 3.2], [540, 0.8]] as const) {
    it(`agree with Vector3.project at inset ${inset} px and zoom ${zoom}`, () => {
      const cam = camera(inset, zoom, 0.3, -0.2);
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

  it('keeps the world scale independent of the inset', () => {
    const a = camera(0, 2, 0, 0);
    const b = camera(300, 2, 0, 0);
    const span = (cam: OrthographicCamera) => drawnAt(cam, 0.2, 0).x - drawnAt(cam, 0, 0).x;
    expect(span(b)).toBeCloseTo(span(a), 6);
  });
});
