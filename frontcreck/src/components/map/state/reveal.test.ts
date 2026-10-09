import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMarks } from '@/lib/marks';
import { MAP_REVEAL_BUDGET_MS, MAP_REVEAL_FADE_MS, getMapReveal, resetMapReveal, setMapReveal, subscribeMapReveal } from './reveal';

describe('how far the map\'s first picture has come', () => {
  beforeEach(() => {
    resetMapReveal();
    resetMarks();
  });

  it('starts with nothing shown and only moves forward', () => {
    expect(getMapReveal()).toBe('wait');
    setMapReveal('stars');
    expect(getMapReveal()).toBe('stars');
    setMapReveal('wait');
    expect(getMapReveal()).toBe('stars');
    setMapReveal('gas');
    expect(getMapReveal()).toBe('gas');
    // the nebula is drawn: a later stop without an image does not bring the stand-in's fade back
    setMapReveal('sky');
    setMapReveal('stars');
    expect(getMapReveal()).toBe('gas');
  });

  it('no nebula is final too', () => {
    setMapReveal('sky');
    setMapReveal('gas');
    expect(getMapReveal()).toBe('sky');
  });

  it('tells its listeners once per change, and marks when the map first showed', () => {
    const seen = vi.fn();
    const off = subscribeMapReveal(seen);
    setMapReveal('gas');
    setMapReveal('gas');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(performance.getEntriesByName('rmr-map-shown').length).toBeGreaterThan(0);
    off();
    resetMapReveal();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('the stars are held back for a quarter of a second at most, and the fade is short', () => {
    expect(MAP_REVEAL_BUDGET_MS).toBeLessThanOrEqual(250);
    expect(MAP_REVEAL_FADE_MS).toBeLessThanOrEqual(250);
  });
});
