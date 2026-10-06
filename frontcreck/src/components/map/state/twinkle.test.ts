import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasRect, worldToScreen } from './projection';
import { drawStarClasses, seededRandom } from './stars';
import {
  TWINKLE_BLOOM,
  TWINKLE_DUR_MS,
  TWINKLE_FLARE,
  TWINKLE_MAX,
  TWINKLE_SETTLE_MS,
  TWINKLE_WAIT_MS,
  TWINKLE_WEIGHT,
  createTwinkle,
  glintBackground,
  glintFor,
  pickStar,
  twinkleShown,
  watchTwinkleSwitch,
  worldToScreenMap,
  type TwinkleHost,
} from './twinkle';

/** A scheduler on vitest's fake timers, with a host whose answers the test sets. */
function harness(random: () => number = () => 0) {
  const state = { hidden: false, reduced: false, resting: true, durMs: 1500, noStar: false };
  const glints: { ended: () => void; removed: boolean }[] = [];
  const delays: number[] = [];
  const host: TwinkleHost = {
    hidden: () => state.hidden,
    reducedMotion: () => state.reduced,
    resting: () => state.resting,
    spawn: (ended) => {
      if (state.noStar) return null;
      const g = { ended, removed: false };
      glints.push(g);
      return {
        durMs: state.durMs,
        remove: () => {
          g.removed = true;
        },
      };
    },
  };
  const tw = createTwinkle(host, {
    setTimeout: (fn, ms) => {
      delays.push(ms);
      return setTimeout(fn, ms) as unknown as number;
    },
    clearTimeout: (id) => clearTimeout(id),
    now: () => Date.now(),
    random,
  });
  return { tw, state, glints, delays };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the settings are the prototype\'s (README, section Twinkle)', () => {
  it('one glint every 1.2 to 3 s, at most 3 alive, 1.2 to 1.8 s each, weights 12, 7, 2.5, 1', () => {
    expect([...TWINKLE_WAIT_MS]).toEqual([1200, 3000]);
    expect(TWINKLE_MAX).toBe(3);
    expect([...TWINKLE_DUR_MS]).toEqual([1200, 1800]);
    expect([...TWINKLE_WEIGHT]).toEqual([12, 7, 2.5, 1]);
    expect([...TWINKLE_BLOOM]).toEqual([5.5, 5]);
    expect(TWINKLE_FLARE).toBe(12);
    expect(TWINKLE_SETTLE_MS).toBe(500);
  });
});

describe('the timer', () => {
  it('waits between 1.2 and 3 s before each glint, a fresh random wait each time', () => {
    // Glints that live 5 s, so their removal timers (5.3 s) can be told from the waits.
    const h = harness(seededRandom(4));
    h.state.durMs = 5000;
    h.tw.sync();
    vi.advanceTimersByTime(60_000);
    const waits = h.delays.filter((d) => d < 5000);
    expect(waits.length).toBeGreaterThanOrEqual(20);
    expect(waits.length).toBeLessThanOrEqual(51);
    expect(Math.min(...waits)).toBeGreaterThanOrEqual(1200);
    expect(Math.max(...waits)).toBeLessThan(3000);
    expect(new Set(waits).size).toBeGreaterThan(10);
    expect(h.tw.stats.ticks).toBe(waits.length - 1);
  });

  it('takes the shortest wait for a random 0 and stays under the longest for a random just under 1', () => {
    const low = harness(() => 0);
    low.tw.sync();
    expect(low.delays).toEqual([1200]);
    const high = harness(() => 0.999999);
    high.tw.sync();
    expect(high.delays[0]).toBeGreaterThan(2999);
    expect(high.delays[0]).toBeLessThan(3000);
  });

  it('makes a glint on a tick, and removes it when its animation ends', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1199);
    expect(h.tw.stats.spawned).toBe(0);
    vi.advanceTimersByTime(1);
    expect(h.tw.stats.spawned).toBe(1);
    expect(h.tw.stats.alive).toBe(1);
    h.glints[0].ended();
    expect(h.glints[0].removed).toBe(true);
    expect(h.tw.stats.alive).toBe(0);
    expect(h.tw.stats.played).toBe(1);
    // Its fallback removal (at 3,000 ms) finds it gone and counts nothing twice; by then a second glint is alive.
    vi.advanceTimersByTime(1900);
    expect(h.tw.stats.ended).toBe(1);
    expect(h.tw.stats.alive).toBe(1);
  });

  it('removes a glint 300 ms after its animation should have ended, if the end never came', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    vi.advanceTimersByTime(1799);
    expect(h.glints[0].removed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(h.glints[0].removed).toBe(true);
    expect(h.tw.stats.played).toBe(0);
  });

  it('never has more than 3 glints alive', () => {
    const h = harness();
    h.state.durMs = 100_000; // glints that outlive the test
    h.tw.sync();
    let most = 0;
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(1200);
      most = Math.max(most, h.tw.stats.alive, h.glints.filter((g) => !g.removed).length);
    }
    expect(most).toBe(3);
    expect(h.tw.stats.spawned).toBe(3);
    expect(h.tw.stats.capped).toBe(17);
  });

  it('makes nothing while the view is not at rest (a pan, a zoom, a slider move, covers showing)', () => {
    const h = harness();
    h.tw.sync();
    h.state.resting = false;
    vi.advanceTimersByTime(12_000);
    expect(h.tw.stats.spawned).toBe(0);
    expect(h.tw.stats.notResting).toBe(10);
    h.state.resting = true;
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('clears every glint when the view changes, and makes none for 500 ms after', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(2400);
    expect(h.tw.stats.alive).toBe(2);
    vi.advanceTimersByTime(700); // 3100 ms: the next tick is at 3600
    h.tw.viewChanged();
    expect(h.tw.stats.alive).toBe(0);
    expect(h.glints.every((g) => g.removed)).toBe(true);
    vi.advanceTimersByTime(500); // the tick at 3600 is exactly 500 ms after the change: still held
    expect(h.tw.stats.spawned).toBe(2);
    expect(h.tw.stats.notResting).toBe(1);
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(3);
  });

  it('never starts under reduced motion, and starts when the setting is lifted', () => {
    const h = harness();
    h.state.reduced = true;
    h.tw.sync();
    expect(h.delays).toEqual([]);
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.ticks).toBe(0);
    expect(h.glints).toEqual([]);
    h.state.reduced = false;
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('stops and clears in a hidden tab, and starts again when the tab shows', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.alive).toBe(1);
    h.state.hidden = true;
    h.tw.sync(); // what the visibilitychange listener calls
    expect(h.tw.stats.alive).toBe(0);
    expect(h.glints[0].removed).toBe(true);
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.ticks).toBe(1);
    h.state.hidden = false;
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(2);
  });

  it('stops on its own tick if the tab was hidden without the event arriving', () => {
    const h = harness();
    h.tw.sync();
    h.state.hidden = true;
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.ticks).toBe(0);
    expect(h.delays).toEqual([1200]);
  });

  it('keeps one timer however often it is synced', () => {
    const h = harness();
    h.tw.sync();
    h.tw.sync();
    h.tw.sync();
    expect(h.delays).toEqual([1200]);
  });

  it('counts nothing when no star can be picked, and tries again on the next tick', () => {
    const h = harness();
    h.state.noStar = true;
    h.tw.sync();
    vi.advanceTimersByTime(2400);
    expect(h.tw.stats.spawned).toBe(0);
    expect(h.tw.stats.ticks).toBe(2);
    h.state.noStar = false;
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('can be switched off and on (tests and the cost measurement use this)', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    h.tw.setEnabled(false);
    expect(h.tw.stats.alive).toBe(0);
    vi.advanceTimersByTime(9000);
    expect(h.tw.stats.spawned).toBe(1);
    h.tw.setEnabled(true);
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(2);
  });

  it('is finished by dispose: the timer is cleared, every glint removed, and sync cannot restart it', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(2400);
    h.tw.dispose();
    expect(h.tw.stats.alive).toBe(0);
    expect(h.glints.every((g) => g.removed)).toBe(true);
    h.tw.sync();
    vi.advanceTimersByTime(20_000);
    expect(h.tw.stats.spawned).toBe(2);
  });
});

describe('pickStar', () => {
  // x = world x, y = world y: a projection that changes nothing.
  const to = { ox: 0, oy: 0, kx: 1, ky: -1 };
  const area = { left: 6, top: 6, right: 194, bottom: 194 };

  it('picks only an album that is on screen: every glint is on a real star', () => {
    const positions = new Float32Array([10, 10, 50, 50, 90, 90, 500, 500]);
    const classes = new Uint8Array([3, 3, 3, 0]);
    const random = seededRandom(3);
    const seen = new Set<number>();
    for (let k = 0; k < 500; k++) {
      const p = pickStar(positions, classes, to, area, [], random)!;
      seen.add(p.index);
      expect([p.x, p.y]).toEqual([positions[2 * p.index], positions[2 * p.index + 1]]);
    }
    // The brightest album is off screen and is never picked.
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it('skips a star under a focus cover', () => {
    const positions = new Float32Array([10, 10, 50, 50, 90, 90]);
    const classes = new Uint8Array([3, 0, 3]);
    const random = seededRandom(5);
    const seen = new Set<number>();
    for (let k = 0; k < 500; k++) seen.add(pickStar(positions, classes, to, area, [{ x: 50, y: 50, half: 29 }], random)!.index);
    expect([...seen].sort()).toEqual([0, 2]);
  });

  it('returns nothing when no star is on screen', () => {
    expect(pickStar(new Float32Array([10, 10]), new Uint8Array([0]), to, { left: 200, top: 200, right: 300, bottom: 300 }, [], seededRandom(1))).toBeNull();
    expect(pickStar(new Float32Array(0), new Uint8Array(0), to, area, [], seededRandom(1))).toBeNull();
  });

  it('picks brighter classes more often, by the weights 12, 7, 2.5, 1', () => {
    const positions = new Float32Array([10, 10, 20, 20, 30, 30, 40, 40]);
    const classes = new Uint8Array([0, 1, 2, 3]);
    const random = seededRandom(11);
    const count = [0, 0, 0, 0];
    for (let k = 0; k < 22_500; k++) count[pickStar(positions, classes, to, area, [], random)!.index]++;
    // Expected 12,000, 7,000, 2,500 and 1,000 of 22,500; within 6%.
    [12_000, 7000, 2500, 1000].forEach((want, c) => expect(Math.abs(count[c] - want), `class ${c}`).toBeLessThan(want * 0.06 + 30));
  });

  it('gives about one glint in three a flare with the real mix of stars', () => {
    const n = 4081;
    const classes = drawStarClasses(n, seededRandom(5));
    const random = seededRandom(9);
    const positions = new Float32Array(2 * n);
    for (let i = 0; i < 2 * n; i++) positions[i] = 10 + random() * 180;
    let flares = 0;
    for (let k = 0; k < 3000; k++) if (classes[pickStar(positions, classes, to, area, [], random)!.index] < 2) flares++;
    // (41 * 12 + 367 * 7) / (41 * 12 + 367 * 7 + 1102 * 2.5 + 2571) = 0.365
    expect(flares / 3000).toBeGreaterThan(0.32);
    expect(flares / 3000).toBeLessThan(0.41);
  });
});

describe('worldToScreenMap', () => {
  it('gives the same screen point as worldToScreen, with and without the album panel offset', () => {
    const base = { position: { x: 0.13, y: -0.07 }, zoom: 1.7, left: -0.947, right: 0.947, top: 0.55, bottom: -0.55 };
    const cameras = [
      { ...base, view: null },
      { ...base, view: { enabled: true, fullWidth: 1440, fullHeight: 836, offsetX: -324, offsetY: 0, width: 1440, height: 836 } },
    ];
    for (const camera of cameras) {
      const m = worldToScreenMap(camera, 1440, 836);
      for (const [wx, wy] of [[0, 0], [0.3, -0.2], [-0.5, 0.41]]) {
        const p = worldToScreen(wx, wy, canvasRect(1440, 836), camera);
        expect(m.ox + wx * m.kx).toBeCloseTo(p.x, 6);
        expect(m.oy - wy * m.ky).toBeCloseTo(p.y, 6);
      }
    }
  });
});

describe('glintFor', () => {
  const pick = { index: 5, x: 100, y: 50 };

  it('is a bloom of radius 5.5 r + 5 on the star, with a flare 12 r each way on the two brightest classes', () => {
    const g = glintFor(pick, 0, 2.8, [255, 250, 244], false, () => 0.5);
    expect(g).toEqual({ index: 5, x: 100, y: 50, radius: expect.closeTo(20.4, 6), flare: expect.closeTo(67.2, 6), rgb: [255, 254, 252], peak: 1, durMs: 1500 });
    expect(glintFor(pick, 1, 1.9, [255, 250, 244], false, () => 0).flare).toBeCloseTo(45.6, 6);
    expect(glintFor(pick, 2, 1.4, [255, 250, 244], false, () => 0).flare).toBeNull();
    expect(glintFor(pick, 3, 1.1, [255, 250, 244], false, () => 0).flare).toBeNull();
  });

  it('is about 22 to 43 px across at the Overview scale and closer, and 18.8 px on the smallest star drawn', () => {
    // Star radii at 12.5 px covers run from 1.1 px (small) to 2.8 px (brightest), and up to about 3.5 px closer in.
    expect(2 * glintFor(pick, 3, 1.1, [255, 250, 244], false, () => 0).radius).toBeCloseTo(22.1, 6);
    expect(2 * glintFor(pick, 0, 3.0, [255, 250, 244], false, () => 0).radius).toBeCloseTo(43, 6);
    // Zoomed out to the whole map, the shader draws no star smaller than 0.8 px.
    expect(2 * glintFor(pick, 3, 0.8, [255, 250, 244], false, () => 0).radius).toBeCloseTo(18.8, 6);
  });

  it('takes the star tint three quarters of the way to white, lasts 1.2 to 1.8 s, and is quieter beside an open album', () => {
    const g = glintFor(pick, 3, 1.1, [248, 212, 198], true, () => 0);
    expect(g.rgb).toEqual([253, 244, 241]);
    expect(g.peak).toBe(0.6);
    expect(g.durMs).toBe(1200);
    expect(glintFor(pick, 3, 1.1, [248, 212, 198], false, () => 0.999999).durMs).toBe(1800);
  });

  it('paints a solid core that falls to nothing, in plain alpha with no blend mode', () => {
    expect(glintBackground([255, 254, 252])).toBe(
      'radial-gradient(circle closest-side, rgba(255,254,252,1) 0, rgba(255,254,252,1) 16%, rgba(255,254,252,.62) 32%, rgba(255,254,252,.24) 56%, rgba(255,254,252,.07) 80%, rgba(255,254,252,0) 100%)',
    );
  });
});

describe('the switch for tests and measurements (window.__rmrTwinkle)', () => {
  it('reads a value set before the map loaded: off for an exact "off", on for anything else', () => {
    const off = vi.fn();
    watchTwinkleSwitch({ __rmrTwinkle: 'off' }, off);
    expect(off.mock.calls).toEqual([[false]]);
    const unset = vi.fn();
    watchTwinkleSwitch({}, unset);
    expect(unset.mock.calls).toEqual([[true]]);
    const on = vi.fn();
    watchTwinkleSwitch({ __rmrTwinkle: 'on' }, on);
    expect(on.mock.calls).toEqual([[true]]);
  });

  it('reports a change in the same call that makes it, with no timer and no polling, and reads back what was set', () => {
    const win: { __rmrTwinkle?: 'off' | 'on' } = {};
    const changed = vi.fn();
    watchTwinkleSwitch(win, changed);
    win.__rmrTwinkle = 'off';
    expect(changed.mock.calls).toEqual([[true], [false]]);
    expect(win.__rmrTwinkle).toBe('off');
    win.__rmrTwinkle = 'on';
    expect(changed.mock.calls).toEqual([[true], [false], [true]]);
    expect(win.__rmrTwinkle).toBe('on');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops watching and leaves the last value behind as a plain field, for the next map to read', () => {
    const win: { __rmrTwinkle?: 'off' | 'on' } = {};
    const changed = vi.fn();
    const stop = watchTwinkleSwitch(win, changed);
    win.__rmrTwinkle = 'off';
    stop();
    expect(Object.getOwnPropertyDescriptor(win, '__rmrTwinkle')).toEqual({ value: 'off', writable: true, enumerable: true, configurable: true });
    win.__rmrTwinkle = 'on';
    expect(changed).toHaveBeenCalledTimes(2);
    const next = vi.fn();
    watchTwinkleSwitch(win, next);
    expect(next.mock.calls).toEqual([[true]]);
  });

  it('switches the timer off and on through it: live glints go at once, and none is made while it says off', () => {
    const h = harness();
    const win: { __rmrTwinkle?: 'off' | 'on' } = {};
    watchTwinkleSwitch(win, h.tw.setEnabled);
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.alive).toBe(1);
    expect(h.tw.enabled()).toBe(true);
    win.__rmrTwinkle = 'off';
    expect(h.tw.stats.alive).toBe(0);
    expect(h.glints[0].removed).toBe(true);
    expect(h.tw.enabled()).toBe(false);
    vi.advanceTimersByTime(9000);
    expect(h.tw.stats.spawned).toBe(1);
    win.__rmrTwinkle = 'on';
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(2);
  });
});

describe('which devices get glints (twinkleShown)', () => {
  it('none on a software renderer, where they cost long frames; all other devices do', () => {
    expect(twinkleShown(true, undefined)).toBe(false);
    expect(twinkleShown(false, undefined)).toBe(true);
    // Not known yet (the gas has not chosen its shader) or no gas layer at all: not counted as software.
    expect(twinkleShown(undefined, undefined)).toBe(true);
  });

  it("an exact 'on' plays them on any renderer (browser tests and the cost measurement draw in software)", () => {
    expect(twinkleShown(true, 'on')).toBe(true);
    expect(twinkleShown(false, 'on')).toBe(true);
    // 'off' is the timer's business (watchTwinkleSwitch); here it changes nothing.
    expect(twinkleShown(true, 'off')).toBe(false);
    expect(twinkleShown(false, 'off')).toBe(true);
  });
});
