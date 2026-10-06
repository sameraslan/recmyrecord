import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STOP_T } from '../data';
import { DEFAULT_INPUT, useMapStore } from './mapStore';
import { inMotion, inStep, markStep, onStepEnd, STEP_HOLD_MS } from './motion';

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

describe('a motion made of steps (a held arrow key, a wheel under reduced motion, a resize)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('counts as motion from its first step until a short while after its last, and then says so once', () => {
    const ended = vi.fn();
    const off = onStepEnd(ended);
    expect(inStep()).toBe(false);
    markStep();
    expect(inStep()).toBe(true);
    // Steps that keep coming (a key repeats every 30 ms or so) keep it going.
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(STEP_HOLD_MS - 10);
      expect(inStep()).toBe(true);
      markStep();
    }
    expect(ended).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STEP_HOLD_MS - 1);
    expect(inStep()).toBe(true);
    vi.advanceTimersByTime(1);
    // Over before it is announced: whoever is told can place at rest.
    expect(inStep()).toBe(false);
    expect(ended).toHaveBeenCalledTimes(1);
    // One timer at most, however many steps there were.
    expect(vi.getTimerCount()).toBe(0);
    off();
  });

  it('tells nobody once the listener has left, and a listener that left does not take a later one with it', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onStepEnd(first);
    const offSecond = onStepEnd(second);
    offFirst();
    markStep();
    vi.advanceTimersByTime(STEP_HOLD_MS);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    offSecond();
    markStep();
    vi.advanceTimersByTime(STEP_HOLD_MS);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('is not part of the covers\' signal: the store says the map is at rest throughout', () => {
    markStep();
    expect(inMotion(useMapStore.getState())).toBe(false);
  });
});
