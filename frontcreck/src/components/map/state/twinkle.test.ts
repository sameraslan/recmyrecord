import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasRect, worldToScreen } from './projection';
import { drawStarClasses, seededRandom } from './stars';
import {
  TWINKLE_BLOOM,
  TWINKLE_DUR_MS,
  TWINKLE_FLARE,
  TWINKLE_GLASS_CLEAR_PX,
  TWINKLE_HOVER_HOLD_MS,
  TWINKLE_MAX,
  TWINKLE_SETTLE_MS,
  TWINKLE_WAIT_MS,
  TWINKLE_WEIGHT,
  createTwinkle,
  glintBackground,
  glintFor,
  glintArea,
  glintBlockers,
  glintReach,
  pickStar,
  twinkleRuledOut,
  twinkleShown,
  watchTwinkleSwitch,
  worldToScreenMap,
  type TwinkleHost,
} from './twinkle';

/** A scheduler on vitest's fake timers, with a host whose answers the test sets. */
function harness(random: () => number = () => 0) {
  const state = { hidden: false, reduced: false, possible: true, resting: true, hovered: false, durMs: 1500, noStar: false };
  const glints: { ended: () => void; removed: boolean }[] = [];
  const delays: number[] = [];
  const host: TwinkleHost = {
    hidden: () => state.hidden,
    reducedMotion: () => state.reduced,
    possible: () => state.possible,
    resting: () => state.resting,
    hovered: () => state.hovered,
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

  it('makes no glint while an album is hovered, nor for 500 ms after; the playing ones are left to finish', () => {
    expect(TWINKLE_HOVER_HOLD_MS).toBe(500);
    const h = harness();
    h.state.durMs = 100_000;
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
    h.state.hovered = true;
    h.tw.hoverChanged(); // what the driver's frame callback reports
    vi.advanceTimersByTime(6000); // five ticks under the hover
    expect(h.tw.stats.spawned).toBe(1);
    expect(h.tw.stats.hoverHeld).toBe(5);
    // The glint that was playing is still there: a hover clears nothing.
    expect(h.glints[0].removed).toBe(false);
    expect(h.tw.stats.alive).toBe(1);
    expect(h.tw.stats.cleared).toBe(0);
    // The hover ends 499 ms before the next tick: still held. The tick after that makes one.
    vi.advanceTimersByTime(701);
    h.state.hovered = false;
    h.tw.hoverChanged();
    vi.advanceTimersByTime(499);
    expect(h.tw.stats.spawned).toBe(1);
    expect(h.tw.stats.hoverHeld).toBe(6);
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(2);
  });

  it('makes a glint on a tick exactly 500 ms after the hover ended', () => {
    const h = harness();
    h.tw.sync();
    h.state.hovered = true;
    h.tw.hoverChanged();
    vi.advanceTimersByTime(700);
    h.state.hovered = false;
    h.tw.hoverChanged();
    vi.advanceTimersByTime(500); // the tick at 1200
    expect(h.tw.stats.spawned).toBe(1);
    expect(h.tw.stats.hoverHeld).toBe(0);
  });

  it('holds for 500 ms from a tick that found an album hovered, even if no change was reported', () => {
    const h = harness(() => 0);
    h.tw.sync();
    h.state.hovered = true;
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.hoverHeld).toBe(1);
    expect(h.tw.stats.spawned).toBe(0);
    h.state.hovered = false;
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('has no timer at all while a glint cannot be made here (covers showing, a software renderer, About, the phone list)', () => {
    const h = harness();
    h.state.possible = false;
    h.tw.sync();
    expect(h.delays).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(h.tw.stats.ticks).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    // The condition clears (the driver reports a change of view or of page): the timer starts.
    h.state.possible = true;
    h.tw.viewChanged();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(1);
  });

  it('stops the timer and clears the glints when a glint becomes impossible, leaving no timer pending', () => {
    const h = harness();
    h.tw.sync();
    vi.advanceTimersByTime(2400);
    expect(h.tw.stats.alive).toBe(2);
    h.state.possible = false;
    h.tw.viewChanged(); // zoomed in until covers show
    expect(h.glints.every((g) => g.removed)).toBe(true);
    // Not the wait, and not the two glints' fallback removals either.
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(h.tw.stats.ticks).toBe(2);
    h.state.possible = true;
    h.tw.sync();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops on its own tick if a glint became impossible with no report (the renderer turned out to be software)', () => {
    const h = harness();
    h.tw.sync();
    h.state.possible = false;
    vi.advanceTimersByTime(1200);
    expect(h.tw.stats.spawned).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops within the tick that learns it: resting() may find out that glints are impossible', () => {
    const h = harness();
    const resting = vi.fn(() => {
      h.state.possible = false; // the renderer was asked for on this tick, and it is a software one
      return false;
    });
    const tw = createTwinkle(
      { hidden: () => false, reducedMotion: () => false, possible: () => h.state.possible, resting, hovered: () => false, spawn: () => null },
      { setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number, clearTimeout: (id) => clearTimeout(id), now: () => Date.now(), random: () => 0 },
    );
    tw.sync();
    vi.advanceTimersByTime(1200);
    expect(resting).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('leaves no timer behind in a hidden tab, under reduced motion, with the switch off, or after dispose', () => {
    for (const stop of [
      (h: ReturnType<typeof harness>) => { h.state.hidden = true; h.tw.sync(); },
      (h: ReturnType<typeof harness>) => { h.state.reduced = true; h.tw.sync(); },
      (h: ReturnType<typeof harness>) => h.tw.setEnabled(false),
      (h: ReturnType<typeof harness>) => h.tw.dispose(),
    ]) {
      const h = harness();
      h.tw.sync();
      vi.advanceTimersByTime(2400); // two glints playing, each with a fallback removal pending
      expect(vi.getTimerCount()).toBe(3);
      stop(h);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('drops a glint\'s fallback removal when its animation ends', () => {
    const h = harness();
    h.state.durMs = 100_000;
    h.tw.sync();
    vi.advanceTimersByTime(1200);
    expect(vi.getTimerCount()).toBe(2); // the wait and the fallback
    h.glints[0].ended();
    expect(vi.getTimerCount()).toBe(1);
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

  it('picks only a star whose whole glint (bloom and flare, by its class) lies inside the area', () => {
    // Reach by class: 30 px each way for the two brightest (their flare), 10 px for the others.
    const reach = [30, 30, 10, 10];
    const box = { left: 0, top: 64, right: 200, bottom: 200 };
    //                                 A: bright, 20 px under the header   B: faint, same place   C: bright, clear   D: faint, 5 px from the right edge
    const positions = new Float32Array([100, 84, 100, 84, 100, 130, 195, 130]);
    const classes = new Uint8Array([0, 3, 1, 3]);
    const random = seededRandom(7);
    const seen = new Set<number>();
    for (let k = 0; k < 500; k++) seen.add(pickStar(positions, classes, to, box, [], random, reach)!.index);
    expect([...seen].sort()).toEqual([1, 2]);
    // Exactly touching the edge is allowed; one hundredth over is not.
    expect(pickStar(new Float32Array([100, 94]), new Uint8Array([0]), to, box, [], random, reach)).not.toBeNull();
    expect(pickStar(new Float32Array([100, 93.99]), new Uint8Array([0]), to, box, [], random, reach)).toBeNull();
  });

  it('skips a star whose glint would reach under a glass surface, on any side of it', () => {
    const reach = [30, 30, 10, 10];
    const box = { left: 0, top: 0, right: 400, bottom: 400 };
    const glass = [{ left: 100, top: 100, right: 200, bottom: 150 }];
    const at = (x: number, y: number, cls: number) => pickStar(new Float32Array([x, y]), new Uint8Array([cls]), to, box, [], seededRandom(1), reach, glass);
    // Inside the surface.
    expect(at(150, 125, 3)).toBeNull();
    // A faint star 9 px off each side: its bloom (10 px) reaches under. 10 px off: clear.
    for (const [x, y] of [[91, 125], [209, 125], [150, 91], [150, 159]]) expect(at(x, y, 3), `${x},${y}`).toBeNull();
    for (const [x, y] of [[90, 125], [210, 125], [150, 90], [150, 160]]) expect(at(x, y, 3), `${x},${y}`).not.toBeNull();
    // A bright star at the same clear spots is not clear: its flare runs 30 px.
    for (const [x, y] of [[90, 125], [210, 125], [150, 90], [150, 160]]) expect(at(x, y, 0), `${x},${y}`).toBeNull();
    for (const [x, y] of [[70, 125], [230, 125], [150, 70], [150, 180]]) expect(at(x, y, 0), `${x},${y}`).not.toBeNull();
    // Diagonally off a corner the glint's box still overlaps the surface's.
    expect(at(95, 95, 3)).toBeNull();
    expect(at(89, 89, 3)).not.toBeNull();
  });

  it('with several glass surfaces, a star must be clear of every one', () => {
    const reach = [0, 0, 0, 0];
    const box = { left: 0, top: 0, right: 100, bottom: 100 };
    const glass = [{ left: 0, top: 0, right: 50, bottom: 100 }, { left: 50, top: 0, right: 100, bottom: 50 }];
    const positions = new Float32Array([25, 25, 75, 25, 25, 75, 75, 75]);
    const classes = new Uint8Array([3, 3, 3, 3]);
    const random = seededRandom(2);
    const seen = new Set<number>();
    for (let k = 0; k < 200; k++) seen.add(pickStar(positions, classes, to, box, [], random, reach, glass)!.index);
    expect([...seen]).toEqual([3]);
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

describe('where a glint may be (glintArea, glintBlockers)', () => {
  it('is the visible map, 22 px in from the header, the album panel, the phone slider panel and the edges', () => {
    expect(glintArea({ width: 1440, height: 900, top: 64, inset: 0, bottomCover: 0 })).toEqual({ left: 22, top: 86, right: 1418, bottom: 878 });
    expect(glintArea({ width: 1280, height: 720, top: 64, inset: 420, bottomCover: 0 })).toEqual({ left: 442, top: 86, right: 1258, bottom: 698 });
    // The phone: a 60 px header and the slider panel across the bottom.
    expect(glintArea({ width: 390, height: 844, top: 60, inset: 0, bottomCover: 165 })).toEqual({ left: 22, top: 82, right: 368, bottom: 657 });
    // The panel's inset overshoots below 0 while it eases away: never left of the canvas.
    expect(glintArea({ width: 1440, height: 900, top: 64, inset: -3, bottomCover: 0 }).left).toBe(22);
  });

  it('keeps the brightest glint (33.6 px each way) wholly below the header with the clearance to spare', () => {
    const area = glintArea({ width: 1440, height: 900, top: 64, inset: 0, bottomCover: 0 });
    const reach = [glintReach(0, 2.8), 0, 0, 0];
    const at = (y: number) => pickStar(new Float32Array([700, y]), new Uint8Array([0]), { ox: 0, oy: 0, kx: 1, ky: -1 }, area, [], seededRandom(1), reach);
    expect(at(64 + 22 + 33.5)).toBeNull();
    expect(at(64 + 22 + 33.7)).not.toBeNull();
  });

  it('grows each glass surface by the clearance', () => {
    expect(glintBlockers([{ left: 440, top: 84, right: 684, bottom: 214 }, { left: 1220, top: 532, right: 1260, bottom: 572 }])).toEqual([
      { left: 418, top: 62, right: 706, bottom: 236 },
      { left: 1198, top: 510, right: 1282, bottom: 594 },
    ]);
    expect(glintBlockers([])).toEqual([]);
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

  it('reaches as far from the star as its bloom or its flare, whichever is longer (glintReach)', () => {
    expect(TWINKLE_GLASS_CLEAR_PX).toBe(22);
    for (const cls of [0, 1, 2, 3]) {
      for (const r of [0.8, 1.1, 1.9, 2.8, 3.5]) {
        const g = glintFor(pick, cls, r, [255, 250, 244], false, () => 0);
        expect(glintReach(cls, r), `class ${cls} radius ${r}`).toBeCloseTo(Math.max(g.radius, (g.flare ?? 0) / 2), 9);
      }
    }
    // The brightest star at the Overview: bloom 20.4 px, flare 33.6 px each way.
    expect(glintReach(0, 2.8)).toBeCloseTo(33.6, 6);
    // A small bright star: the bloom (5.5 r + 5) is wider than the flare (12 r) under r = 0.77; the shader's floor is 0.8.
    expect(glintReach(1, 0.5)).toBeCloseTo(7.75, 6);
    expect(glintReach(3, 1.1)).toBeCloseTo(11.05, 6);
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

describe('which devices get glints (twinkleShown, twinkleRuledOut)', () => {
  it('none on a software renderer, where they cost long frames; a renderer known to be a GPU gets them', () => {
    expect(twinkleShown(true, undefined)).toBe(false);
    expect(twinkleShown(false, undefined)).toBe(true);
  });

  it('none while the renderer is not known (no answer from the graphics context yet): unknown is not a GPU', () => {
    expect(twinkleShown(undefined, undefined)).toBe(false);
    expect(twinkleShown(undefined, 'off')).toBe(false);
  });

  it("an exact 'on' plays them on any renderer, known or not (browser tests and the cost measurement draw in software)", () => {
    expect(twinkleShown(true, 'on')).toBe(true);
    expect(twinkleShown(false, 'on')).toBe(true);
    expect(twinkleShown(undefined, 'on')).toBe(true);
    // 'off' is the timer's business (watchTwinkleSwitch); here it changes nothing.
    expect(twinkleShown(true, 'off')).toBe(false);
    expect(twinkleShown(false, 'off')).toBe(true);
  });

  it('are ruled out for good only by a renderer known to be software, unless forced: then there is no timer', () => {
    expect(twinkleRuledOut(true, undefined)).toBe(true);
    expect(twinkleRuledOut(true, 'off')).toBe(true);
    expect(twinkleRuledOut(true, 'on')).toBe(false);
    expect(twinkleRuledOut(false, undefined)).toBe(false);
    // Not known yet: the timer runs, so that a quiet tick can ask; no glint is made until the answer is "a GPU".
    expect(twinkleRuledOut(undefined, undefined)).toBe(false);
  });
});
