import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThemeData } from '@/lib/data/theme';
import { EMBER_RGB, STAR_WHITE } from '../theme';
import { hitRadiusCssPx } from './hitTest';
import { DOT_MAX_PX, zoomForCoverPx } from './zoomLimits';
import {
  DOT_AT_OVERVIEW,
  STAR_ALPHA,
  STAR_GLOW,
  STAR_MIX,
  STAR_RADIUS,
  STAR_WIDE,
  buildStarAttributes,
  drawStarClasses,
  pageStarClasses,
  resetPageStars,
  seededRandom,
  starCoreCssPx,
  starCounts,
  starTint,
  starUnder,
} from './stars';

const H = 836;
/** The real catalogue size, so the mix is checked for the number of stars the site draws. */
const N = (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as unknown[]).length;

/** One stop's gas images as theme.json version 3 describes them (the fixture of src/lib/data/theme.test.ts); unused here. */
const STOP_GAS = { rect: [-1.4, -1.4, 1.1, 1.4] as [number, number, number, number], px: [1829, 2048] as [number, number], sharp: [3200, 3584] as [number, number], hash: ['0123456789', 'abcdef0123'] as [string, string] };
function theme(n: number, lead: number[], bg: number[]): ThemeData {
  return { v: 3, n, positionsHash: 'x', bakeHalf: 1.75, gas: { sonic: STOP_GAS, balanced: STOP_GAS, mood: STOP_GAS }, stars: { lead, bg }, labels: { sonic: [], balanced: [], mood: [] } };
}
const histogram = (classes: Uint8Array): number[] => {
  const h = [0, 0, 0, 0];
  for (const c of classes) h[c]++;
  return h;
};

describe('seededRandom', () => {
  it('gives the same numbers for the same seed, different ones for another, all in 0 to 1', () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const as = Array.from({ length: 200 }, a);
    expect(as).toEqual(Array.from({ length: 200 }, b));
    expect(as).not.toEqual(Array.from({ length: 200 }, c));
    expect(as.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('is the prototype generator (mulberry32)', () => {
    const r = seededRandom(7);
    expect([r(), r(), r()]).toEqual([0.011704753153026104, 0.06195825757458806, 0.97690763277933]);
  });
});

describe('starCounts (the 1%, 9%, 27% mix in whole albums)', () => {
  it('is exact for the real catalogue: each class within half an album of its share, the rest small', () => {
    const counts = starCounts(N);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(N);
    // Tolerance: rounding to a whole album, so at most 0.5 from the exact share.
    for (let k = 0; k < 3; k++) expect(Math.abs(counts[k] - N * STAR_MIX[k])).toBeLessThanOrEqual(0.5);
    expect(counts[3]).toBe(N - counts[0] - counts[1] - counts[2]);
    expect(starCounts(4081)).toEqual([41, 367, 1102, 2571]);
  });

  it('never deals more albums than there are', () => {
    expect(starCounts(0)).toEqual([0, 0, 0, 0]);
    expect(starCounts(1)).toEqual([0, 0, 0, 1]);
    expect(starCounts(2)).toEqual([0, 0, 1, 1]);
    expect(starCounts(100)).toEqual([1, 9, 27, 63]);
  });
});

describe('drawStarClasses (the random deal)', () => {
  it('deals exactly the mix for the real catalogue, whatever the seed', () => {
    for (const seed of [1, 2, 3, 99, 4294967295]) expect(histogram(drawStarClasses(N, seededRandom(seed))), `seed ${seed}`).toEqual(starCounts(N));
  });

  it('gives the same assignment for the same seed', () => {
    expect(drawStarClasses(N, seededRandom(5))).toEqual(drawStarClasses(N, seededRandom(5)));
  });

  it('gives a different assignment for a different seed', () => {
    const a = drawStarClasses(N, seededRandom(1));
    const b = drawStarClasses(N, seededRandom(2));
    let differ = 0;
    for (let i = 0; i < N; i++) if (a[i] !== b[i]) differ++;
    // Two independent deals of this mix differ on about 52% of the albums (1 - 0.01^2 - 0.09^2 - 0.27^2 - 0.63^2).
    expect(differ).toBeGreaterThan(N * 0.4);
  });

  it('does not follow album order: the first albums are bright no more often than any others', () => {
    // Over 400 seeds, count how often one of the first 41 albums (the chart's top 1%) is in the brightest class.
    // A fair deal expects 400 * 41 * 41 / 4081 = 165 of 16,400; a rule that followed album order gives 16,400.
    // The same for the first 408 albums (the top 10%) in the two brightest classes: a fair deal expects 16,316
    // of 163,200; a rule that followed album order gives 163,200.
    let top1 = 0;
    let top10 = 0;
    let indexSum = 0;
    let brightest = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const c = drawStarClasses(4081, seededRandom(seed));
      for (let i = 0; i < 4081; i++) {
        if (c[i] === 0) {
          if (i < 41) top1++;
          indexSum += i;
          brightest++;
        }
        if (i < 408 && c[i] <= 1) top10++;
      }
    }
    expect(top1).toBeGreaterThan(100);
    expect(top1).toBeLessThan(240);
    expect(top10).toBeGreaterThan(15500);
    expect(top10).toBeLessThan(17100);
    // The brightest stars sit, on average, in the middle of the album list (index 2,040), not at its start.
    expect(Math.abs(indexSum / brightest - 2040)).toBeLessThan(60);
  });

  it('takes the number of albums and the random source, and nothing else', () => {
    // No album record, index list or rank can be passed in: the function has exactly these two parameters.
    expect(drawStarClasses.length).toBe(2);
    // And every number it uses comes from the source: a source that always answers 0 gives one fixed deal.
    expect(drawStarClasses(50, () => 0)).toEqual(drawStarClasses(50, () => 0));
    expect(histogram(drawStarClasses(50, () => 0.999999))).toEqual(starCounts(50));
  });

  it('copes with no albums and with one', () => {
    expect(drawStarClasses(0, seededRandom(1))).toEqual(new Uint8Array(0));
    expect(drawStarClasses(1, seededRandom(1))).toEqual(new Uint8Array([3]));
  });
});

describe('pageStarClasses (one deal per page load)', () => {
  beforeEach(() => {
    resetPageStars();
    // The test hooks object as the store module leaves it, with no seed on it.
    window.__rmr = { ...window.__rmr! };
    delete window.__rmr.starSeed;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetPageStars();
  });

  it('deals once and returns the same array from then on, so slider moves, pans and zooms cannot change a class', () => {
    const first = pageStarClasses(N);
    const copy = Uint8Array.from(first);
    // Whatever happens later in the page load, the next call hands back the very same array, unchanged.
    for (let k = 0; k < 5; k++) expect(pageStarClasses(N)).toBe(first);
    expect(first).toEqual(copy);
    expect(histogram(first)).toEqual(starCounts(N));
  });

  it('publishes the seed it used, and the deal is the one that seed gives', () => {
    const classes = pageStarClasses(N);
    const seed = window.__rmr!.starSeed!;
    expect(Number.isInteger(seed)).toBe(true);
    expect(classes).toEqual(drawStarClasses(N, seededRandom(seed)));
  });

  it('deals afresh on the next page load', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
    const first = Uint8Array.from(pageStarClasses(N));
    expect(window.__rmr!.starSeed).toBe(Math.floor(0.25 * 4294967296));
    resetPageStars(); // what a reload does
    delete window.__rmr!.starSeed;
    const second = pageStarClasses(N);
    expect(window.__rmr!.starSeed).toBe(Math.floor(0.75 * 4294967296));
    expect(second).not.toEqual(first);
  });

  it('uses a seed a test put on window.__rmr before the map loaded', () => {
    window.__rmr!.starSeed = 7;
    expect(pageStarClasses(N)).toEqual(drawStarClasses(N, seededRandom(7)));
    expect(window.__rmr!.starSeed).toBe(7);
  });

  it('keeps the page seed if the number of albums changes', () => {
    window.__rmr!.starSeed = 7;
    pageStarClasses(N);
    expect(pageStarClasses(100)).toEqual(drawStarClasses(100, seededRandom(7)));
  });
});

describe('starTint', () => {
  it('is three quarters star white and one quarter the leading family hue', () => {
    const want = [0, 1, 2].map((k) => Math.round(STAR_WHITE[k] * 0.75 + EMBER_RGB[2][k] * 0.25));
    expect(starTint(2)).toEqual(want);
  });

  it('is plain star white for an album with no leading family, or a family that does not exist', () => {
    expect(starTint(-1)).toEqual([...STAR_WHITE]);
    expect(starTint(9)).toEqual([...STAR_WHITE]);
  });
});

describe('starUnder (how much dark disc the gas behind a star needs)', () => {
  it('is nothing on gas no brighter than 0.5, and never more than 0.26', () => {
    expect(starUnder(0)).toBe(0);
    expect(starUnder(0.5)).toBe(0);
    expect(starUnder(0.6)).toBeCloseTo(1 - 0.5 / 0.6, 6);
    expect(starUnder(10)).toBe(0.26);
  });
});

describe('buildStarAttributes', () => {
  it('packs each album its dealt class radius, glow, alpha and halo reach, with the tint and gas luminance from the theme', () => {
    const a = buildStarAttributes(new Uint8Array([3, 0, 2]), theme(3, [0, -1, 4], [10, 20, 30, 40, 50, 60, 70, 80, 90]));
    const row = (i: number) => [...a.star.slice(4 * i, 4 * i + 4)].map((v) => +v.toFixed(2));
    expect(row(0)).toEqual([STAR_RADIUS[3], STAR_GLOW[3], STAR_ALPHA[3], STAR_WIDE[3]]);
    expect(row(1)).toEqual([STAR_RADIUS[0], STAR_GLOW[0], STAR_ALPHA[0], STAR_WIDE[0]]);
    expect(row(2)).toEqual([STAR_RADIUS[2], STAR_GLOW[2], STAR_ALPHA[2], STAR_WIDE[2]]);
    expect([...a.tint.slice(0, 3)]).toEqual(starTint(0));
    expect([...a.tint.slice(3, 6)]).toEqual([...STAR_WHITE]);
    expect([...a.tint.slice(6, 9)]).toEqual(starTint(4));
    expect([...a.bg]).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it('takes size and brightness from the deal alone: the same albums with another deal get other sizes, the same tints', () => {
    const t = theme(3, [0, 1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const a = buildStarAttributes(new Uint8Array([0, 1, 2]), t);
    const b = buildStarAttributes(new Uint8Array([2, 0, 1]), t);
    expect([...a.star]).not.toEqual([...b.star]);
    expect([...a.tint]).toEqual([...b.tint]);
    expect([...a.bg]).toEqual([...b.bg]);
  });

  it('falls back to white stars with no under-disc when the theme data is missing', () => {
    const a = buildStarAttributes(new Uint8Array([3, 1]), null);
    expect([...a.tint]).toEqual([...STAR_WHITE, ...STAR_WHITE]);
    expect([...a.bg]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(+a.star[4].toFixed(2)).toBe(STAR_RADIUS[1]);
  });

  it('falls back to white stars when the theme data is for a different number of albums', () => {
    const wrongN = buildStarAttributes(new Uint8Array(2), theme(3, [0, 1, 2], [9, 9, 9, 9, 9, 9, 9, 9, 9]));
    const short = buildStarAttributes(new Uint8Array(2), theme(2, [0], [9, 9, 9]));
    for (const a of [wrongN, short]) {
      expect([...a.tint]).toEqual([...STAR_WHITE, ...STAR_WHITE]);
      expect([...a.bg]).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });
});

describe('star size against the dot size the hit test uses', () => {
  it('uses the dot rule relative to its value at 12.5 px covers', () => {
    expect(DOT_AT_OVERVIEW).toBeCloseTo(1.8 + 12.5 / 3.15, 10);
    expect(starCoreCssPx(0, zoomForCoverPx(12.5, H), H)).toBeCloseTo(2 * STAR_RADIUS[0], 6);
  });

  it('never draws a star core wider than the dot, so the 14 px and 24 px hit radii still cover it', () => {
    for (const cover of [1, 4, 8, 12.5, 16, 24, 32, 64]) {
      for (const cls of [0, 1, 2, 3]) {
        const core = starCoreCssPx(cls, zoomForCoverPx(cover, H), H);
        expect(core).toBeLessThanOrEqual(DOT_MAX_PX);
        expect(core / 2).toBeLessThan(hitRadiusCssPx('mouse'));
        expect(core / 2).toBeLessThan(hitRadiusCssPx('touch'));
      }
    }
  });
});
