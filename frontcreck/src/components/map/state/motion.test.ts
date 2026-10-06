import { beforeEach, describe, expect, it } from 'vitest';
import { STOP_T } from '../data';
import { DEFAULT_INPUT, useMapStore } from './mapStore';
import { inMotion } from './motion';

describe('inMotion (the view is still on its way somewhere)', () => {
  beforeEach(() => {
    const s = useMapStore.getState();
    s.setInput({ ...DEFAULT_INPUT });
    s.setSliderT(STOP_T[DEFAULT_INPUT.stop]);
    s.setInsetCurrent(DEFAULT_INPUT.insetLeft);
    s.setDragging(false);
    s.setPinching(false);
    s.setAnimating(false);
    s.setNudging(false);
    s.setRigMoving(false);
    s.setMorphing(false);
  });

  it('is false for a map at rest', () => {
    expect(inMotion(useMapStore.getState())).toBe(false);
  });

  it('is true through a pinch, which no other flag covers', () => {
    useMapStore.getState().setPinching(true);
    expect(useMapStore.getState().dragging).toBe(false);
    expect(inMotion(useMapStore.getState())).toBe(true);
    useMapStore.getState().setPinching(false);
    expect(inMotion(useMapStore.getState())).toBe(false);
  });

  it('is true for a drag, a tween, a fling or wheel easing, a nudge, a morph, a pending morph and the sliding panel', () => {
    const s = useMapStore.getState();
    for (const set of [
      () => s.setDragging(true),
      () => s.setAnimating(true),
      () => s.setRigMoving(true),
      () => s.setNudging(true),
      () => s.setMorphing(true),
      () => s.setSliderT(0.3),
      () => s.setInsetCurrent(120),
    ]) {
      set();
      expect(inMotion(useMapStore.getState())).toBe(true);
      s.setDragging(false);
      s.setAnimating(false);
      s.setRigMoving(false);
      s.setNudging(false);
      s.setMorphing(false);
      s.setSliderT(STOP_T[DEFAULT_INPUT.stop]);
      s.setInsetCurrent(DEFAULT_INPUT.insetLeft);
      expect(inMotion(useMapStore.getState())).toBe(false);
    }
  });
});
