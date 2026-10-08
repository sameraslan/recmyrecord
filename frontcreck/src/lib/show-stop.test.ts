import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/lib/store';
import { showStop } from './show-stop';

/** showStop moves the store at once and writes `?by=` a frame and a task later, only while it still holds. */
describe('showStop', () => {
  let frames: FrameRequestCallback[] = [];
  const runFrame = () => {
    const due = frames;
    frames = [];
    due.forEach((f) => f(0));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    useAppStore.getState().setStop('balanced');
    window.history.replaceState(null, '', '/album/ys-joanna-newsom');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useAppStore.getState().setStop('balanced');
    window.history.replaceState(null, '', '/');
  });

  it('moves the slider at once and writes ?by= after a frame, without a history entry', () => {
    const entries = window.history.length;
    showStop('mood');
    expect(useAppStore.getState().stop).toBe('mood');
    expect(window.location.search).toBe('');
    runFrame();
    expect(window.location.search).toBe('');
    vi.runAllTimers();
    expect(window.location.pathname + window.location.search).toBe('/album/ys-joanna-newsom?by=mood');
    expect(window.history.length).toBe(entries);
  });

  it('writes no ?by= for the default stop', () => {
    window.history.replaceState(null, '', '/album/ys-joanna-newsom?by=sound');
    useAppStore.getState().setStop('sonic');
    showStop('balanced');
    runFrame();
    vi.runAllTimers();
    expect(window.location.pathname + window.location.search).toBe('/album/ys-joanna-newsom');
  });

  it('leaves the URL alone when the slider has moved on before the write', () => {
    showStop('mood');
    useAppStore.getState().setStop('sonic');
    runFrame();
    vi.runAllTimers();
    expect(window.location.search).toBe('');
  });

  it('leaves the URL alone away from an album page', () => {
    window.history.replaceState(null, '', '/map');
    showStop('mood');
    runFrame();
    vi.runAllTimers();
    expect(useAppStore.getState().stop).toBe('mood');
    expect(window.location.pathname + window.location.search).toBe('/map');
  });
});
