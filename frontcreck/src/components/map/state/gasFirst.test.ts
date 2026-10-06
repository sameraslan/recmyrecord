import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gasFirstBegin, gasFirstEnd, gasFirstPending, NAMES_GAS_WAIT_MS } from './gasFirst';

describe('the first gas image, as the region names wait for it', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    gasFirstEnd();
    vi.useRealTimers();
  });

  it('is not awaited when no gas ever began to load (no WebGL gas, no theme)', () => {
    expect(gasFirstPending()).toBe(false);
  });

  it('is awaited from the moment the gas begins to load until its first image is settled, in or failed', () => {
    const giveUp = vi.fn();
    gasFirstBegin(giveUp);
    expect(gasFirstPending()).toBe(true);
    vi.advanceTimersByTime(NAMES_GAS_WAIT_MS - 1);
    expect(gasFirstPending()).toBe(true);
    gasFirstEnd();
    expect(gasFirstPending()).toBe(false);
    // Settled in time: nobody is told (the frame that shows the gas places the names), and no timer is left.
    vi.advanceTimersByTime(10_000);
    expect(giveUp).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up on a slow image after NAMES_GAS_WAIT_MS: no longer awaited, and says so once', () => {
    const giveUp = vi.fn(() => expect(gasFirstPending()).toBe(false));
    gasFirstBegin(giveUp);
    vi.advanceTimersByTime(NAMES_GAS_WAIT_MS - 1);
    expect(giveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(giveUp).toHaveBeenCalledTimes(1);
    expect(gasFirstPending()).toBe(false);
    // The image arriving afterwards changes nothing.
    gasFirstEnd();
    vi.advanceTimersByTime(10_000);
    expect(giveUp).toHaveBeenCalledTimes(1);
  });

  it('starts over when the gas starts over (new theme data), with one timer', () => {
    const first = vi.fn();
    const second = vi.fn();
    gasFirstBegin(first);
    vi.advanceTimersByTime(NAMES_GAS_WAIT_MS - 100);
    gasFirstBegin(second);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(NAMES_GAS_WAIT_MS - 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('is long enough for the longest wait the gas itself allows its first upload', async () => {
    const { GAS_FIRST_UPLOAD_CAP_MS } = await import('../shaders/gas');
    expect(NAMES_GAS_WAIT_MS).toBeGreaterThan(GAS_FIRST_UPLOAD_CAP_MS);
  });
});
