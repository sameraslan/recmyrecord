import fs from 'node:fs';
import path from 'node:path';
import { OrthographicCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { nudgeVector, viewportWorldRect, visibleFractionThreshold, visibleWorldRect } from '../state/bounds';
import { DEFAULT_INPUT } from '../state/mapStore';
import { canvasRect, screenToWorld } from '../state/projection';
import { visibleScale } from '../state/zoomLimits';
import { HEADER_NARROW_PX, HEADER_PX } from '../types';
import { focusKey } from './FocusFramer';
import { applyFrustum, sizeChanged } from './InitialFrame';
import { retargeted } from './MarkerDriver';

/** The header is 64 px tall, and 60 px under 900 px wide. Each test here fails when one of the places that follow
 * that height (MapInput.insetTop) stops following it. */
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src/components/map/canvas', file), 'utf8');

describe('a new header height (the window crossed 900 px wide)', () => {
  it('re-solves the markers for a tween\'s target: the header inset is part of MarkerDriver\'s change key', () => {
    const k = new Float64Array(9);
    const to = { x: 0.2, y: -0.1, zoom: 3 };
    type Args = [insetLeft: number, stop: number, width: number, height: number, bottomCover: number, insetTop: number];
    const base: Args = [480, 0.5, 1000, 800, 0, HEADER_PX];
    expect(retargeted(k, to, ...base)).toBe(true);
    expect(retargeted(k, to, ...base)).toBe(false);
    // Only the header's height changes.
    const narrow: Args = [480, 0.5, 1000, 800, 0, HEADER_NARROW_PX];
    expect(retargeted(k, to, ...narrow)).toBe(true);
    expect(k[8]).toBe(HEADER_NARROW_PX);
    expect(retargeted(k, to, ...narrow)).toBe(false);
    // And each of the other eight, alone.
    for (let i = 0; i < 5; i++) {
      const next: Args = [...narrow];
      next[i] += 1;
      expect(retargeted(k, to, ...next), `argument ${i}`).toBe(true);
      expect(retargeted(k, to, ...next)).toBe(false);
      expect(retargeted(k, to, ...narrow)).toBe(true);
    }
    for (const moved of [{ ...to, x: 0.3 }, { ...to, y: 0 }, { ...to, zoom: 4 }]) {
      expect(retargeted(k, moved, ...narrow)).toBe(true);
      expect(retargeted(k, to, ...narrow)).toBe(true);
    }
    // MarkerDriver passes the input's own inset, last.
    expect(read('MarkerDriver.tsx')).toContain('retargeted(w.target, to, input.insetLeft, stop, width, height, input.bottomCover, input.insetTop)');
  });

  it('frames an open album again: the header inset is part of FocusFramer\'s key', () => {
    const focus = { seed: 11, recs: [1, 2, 3] };
    const at = (insetTop: number) => focusKey({ input: { ...DEFAULT_INPUT, focus, insetTop } });
    expect(at(HEADER_PX)).not.toBe(at(HEADER_NARROW_PX));
    expect(at(HEADER_PX)).toBe(at(HEADER_PX));
    // No album open: nothing to frame, whatever the header.
    expect(focusKey({ input: { ...DEFAULT_INPUT, focus: null, insetTop: HEADER_PX } })).toBe('');
  });

  it('fits the untouched map again, also when it arrives without a canvas resize', () => {
    expect(sizeChanged(null, 1000, 800, HEADER_PX)).toBe(false);
    const last = { width: 880, height: 800, insetTop: HEADER_PX };
    expect(sizeChanged(last, 880, 800, HEADER_PX)).toBe(false);
    expect(sizeChanged(last, 880, 800, HEADER_NARROW_PX)).toBe(true);
    expect(sizeChanged(last, 881, 800, HEADER_PX)).toBe(true);
    expect(sizeChanged(last, 880, 801, HEADER_PX)).toBe(true);
    // InitialFrame feeds it the size it last fitted, and runs again when the inset alone changes.
    const src = read('InitialFrame.tsx');
    expect(src).toContain('const resized = sizeChanged(lastSize.current, width, height, insetTop);');
    expect(src).toContain('lastSize.current = { width, height, insetTop };');
    expect(src).toContain('}, [data, width, height, insetTop, camera, invalidate]);');
  });
});

describe('the idle camera is kept on the cloud by what is in view below the header', () => {
  const W = 1000;
  for (const [H, top] of [[900, HEADER_PX], [844, HEADER_NARROW_PX], [500, 120]] as const) {
    it(`a ${H} px canvas under a ${top} px header: the area in view ends at the header's bottom edge`, () => {
      const cam = new OrthographicCamera();
      cam.position.set(0.3, -0.2, 5);
      cam.zoom = 2.4;
      applyFrustum(cam, W, H, 0, top);
      cam.updateMatrixWorld();
      const rect = canvasRect(W, H);
      const [, yTop] = screenToWorld(W / 2, top, rect, cam);
      const [, yBottom] = screenToWorld(W / 2, H, rect, cam);
      const [xLeft] = screenToWorld(0, H / 2, rect, cam);
      const [xRight] = screenToWorld(W, H / 2, rect, cam);
      const visible = visibleWorldRect(cam, visibleScale(H, top));
      expect(visible.halfH).toBeCloseTo((yTop - yBottom) / 2, 9);
      expect(visible.halfW).toBeCloseTo((xRight - xLeft) / 2, 9);
      // The camera's position is the centre of that area.
      expect((yTop + yBottom) / 2).toBeCloseTo(cam.position.y, 9);
      // The whole canvas is taller by what is behind the header.
      expect(viewportWorldRect(cam).halfH).toBeGreaterThan(visible.halfH);
    });
  }

  it('a cloud that is in view only behind the header is pulled back; counted over the whole canvas it would be left there', () => {
    // A camera whose visible window is 1 world unit tall, under a header that hides a further 0.2 above it.
    const cam = { left: -1, right: 1, top: 0.6, bottom: -0.6, zoom: 1 };
    const scale = 1 / 1.2;
    const cloud = { minX: -0.5, maxX: 0.5, minY: 0.5, maxY: 0.7 };
    const centre = { x: 0, y: 0 };
    const threshold = visibleFractionThreshold(2, 1);
    // All of the cloud is above the visible window's top edge (y 0.5): out of view.
    expect(nudgeVector(centre, visibleWorldRect(cam, scale), cloud, 0, threshold)).not.toBeNull();
    // The whole canvas reaches y 0.6, half of the cloud: over the 25 % mark, so no pull.
    expect(nudgeVector(centre, viewportWorldRect(cam), cloud, 0, threshold)).toBeNull();
  });

  it('CameraBounds reads the visible window', () => {
    const src = read('CameraBounds.tsx');
    expect(src).toContain('const viewport = visibleWorldRect(cam, getVisibleScale());');
    expect(src).not.toMatch(/viewportWorldRect\(/);
  });

  it('CameraBounds lets the camera rest lower by what a bottom panel covers', () => {
    expect(read('CameraBounds.tsx')).toContain('(coveredBottomPx(input) * (cam.top - cam.bottom)) / (state.size.height * cam.zoom),');
  });
});
