import { expect, test, type Page } from '@playwright/test';
import { drawStarClasses, seededRandom } from '../src/components/map/state/stars';
import { coverCssPx } from '../src/components/map/state/zoomLimits';
import { twinkleOff, waitForAnimations, waitForCameraIdle, waitForGasSharpSettled, waitForMap } from './helpers';

/** The stars in a browser (part 2 Task 9). Every star is an album, and which album is a bright star is dealt
 * afresh on every page load (components/map/state/stars.ts). The unit tests pin the deal and the source of the
 * one component that draws the stars; these check what a page load really hands to the GPU. */

const seed = (page: Page) => page.evaluate(() => window.__rmr!.starSeed);

async function openMap(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
}

test('star sizes are dealt once per page load, and afresh on the next', async ({ page }) => {
  await openMap(page);
  const first = await seed(page);
  expect(Number.isInteger(first)).toBe(true);
  // A slider move, a pan and a zoom later, the page still has the same deal.
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await waitForCameraIdle(page);
  await page.locator('canvas.map-canvas').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('+');
  await waitForCameraIdle(page);
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  expect(await seed(page)).toBe(first);
  // Two more loads: three seeds drawn from 4,294,967,296 values, all different.
  await page.reload();
  await waitForMap(page);
  const second = await seed(page);
  await page.reload();
  await waitForMap(page);
  const third = await seed(page);
  expect(new Set([first, second, third]).size).toBe(3);
});

test('a test can ask for a repeatable sky by setting the seed before the map loads', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __rmr: { starSeed: number } }).__rmr = { starSeed: 7 };
  });
  await openMap(page);
  expect(await seed(page)).toBe(7);
});

/** What the map handed to the GPU for its points, recorded from the page's first script on: every buffer of four
 * floats per album whose first float takes exactly four values (the star attribute: a size class per album), and
 * the instance count of every instanced draw of points. */
interface Sky {
  albums: number;
  /** Per star buffer uploaded: the size class of each album, 0 for the largest size. */
  classes: number[][];
  /** Instance counts of the instanced point draws. */
  drawn: number[];
}

async function recordSky(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __sky: { buffers: Float32Array[]; drawn: number[] } };
    w.__sky = { buffers: [], drawn: [] };
    const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const bufferData = P.bufferData;
    P.bufferData = function (this: unknown, ...a: unknown[]) {
      if (a[1] instanceof Float32Array) w.__sky.buffers.push(a[1].slice());
      return bufferData.apply(this, a);
    };
    const draw = P.drawArraysInstanced;
    P.drawArraysInstanced = function (this: unknown, ...a: unknown[]) {
      if (a[0] === WebGL2RenderingContext.POINTS && !w.__sky.drawn.includes(a[3] as number)) w.__sky.drawn.push(a[3] as number);
      return draw.apply(this, a);
    };
  });
}

async function sky(page: Page): Promise<Sky> {
  return page.evaluate(async () => {
    const albums = ((await (await fetch('/data/albums.json')).json()) as unknown[]).length;
    const w = window as unknown as { __sky: { buffers: Float32Array[]; drawn: number[] } };
    const classes: number[][] = [];
    for (const b of w.__sky.buffers) {
      if (b.length !== 4 * albums) continue;
      const sizes = [...new Set(Array.from({ length: albums }, (_, i) => b[4 * i]))].sort((p, q) => q - p);
      if (sizes.length !== 4) continue;
      classes.push(Array.from({ length: albums }, (_, i) => sizes.indexOf(b[4 * i])));
    }
    return { albums, classes, drawn: w.__sky.drawn };
  });
}

test('every star is an album, and which albums are the bright stars is this page load\'s own deal: 1%, 9% and 27% in the three brighter classes, differently on the next load', async ({ page }) => {
  await recordSky(page);
  await openMap(page);
  const first = await sky(page);
  // One set of points, one per album: nothing is drawn as a star that is not an album.
  expect(first.drawn, 'instance counts of the point draws').toEqual([first.albums]);
  expect(first.classes.length, 'star buffers handed to the GPU').toBe(1);
  const count = (classes: number[]) => [0, 1, 2, 3].map((c) => classes.filter((k) => k === c).length);
  const n = first.albums;
  const mix = [Math.round(n * 0.01), Math.round(n * 0.09), Math.round(n * 0.27)];
  expect(count(first.classes[0])).toEqual([...mix, n - mix[0] - mix[1] - mix[2]]);
  await page.reload();
  await waitForMap(page);
  await waitForCameraIdle(page);
  const second = await sky(page);
  expect(second.drawn).toEqual([n]);
  expect(second.classes.length).toBe(1);
  expect(count(second.classes[0])).toEqual(count(first.classes[0]));
  // Another deal: with 41 brightest stars among 4,081 albums, two loads agree on all of them by chance never.
  const differ = first.classes[0].filter((c, i) => c !== second.classes[0][i]).length;
  expect(differ, 'albums whose star class differs between the two loads').toBeGreaterThan(n / 10);
});

/** The Stone Roses at 1600 x 1000: the approved picture of an open album (docs/design/trifid-theme/options/
 * final-album.jpg). Its framing is close: covers on the map would be 16 to 25 px, the first half of their fade.
 * On the map of 10,467 albums its group is tighter than the least span an open album is framed at (state/
 * focusLayout.ts MIN_FOCUS_SPAN), as most groups are, so this is the closest framing an open album gets: covers of
 * 24.39 px (19.80 px on 4,081 albums, when the bound here was 24). */
const STONE = '/album/the-stone-roses-the-stone-roses';

test('beside an open album at a close framing the stars are still points: no flat disc of the star colour round a small star', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the approved desktop picture; the same shader draws the phone');
  test.setTimeout(120_000);
  const SEED = 7;
  await page.addInitScript((seed) => {
    (window as unknown as { __rmr: { starSeed: number } }).__rmr = { starSeed: seed };
    window.__rmrTwinkle = 'off';
  }, SEED);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(STONE);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await page.waitForLoadState('networkidle');
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  await twinkleOff(page);
  await waitForCameraIdle(page);

  // The framing this test is about: the cover fade has started (16 px) and is in its first half.
  const view = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!.getBoundingClientRect();
    return { zoom: window.__rmr!.map!.getCamera().zoom, height: c.height };
  });
  const coverPx = coverCssPx(view.zoom, view.height);
  expect(coverPx, 'covers on the map at this framing, CSS px').toBeGreaterThan(16);
  expect(coverPx).toBeLessThan(25);

  // Small stars (the smallest class of this load's deal) outside the open album's focus, on the bare map: no
  // other album within 16 px, clear of the focus covers, and nothing of the page over them.
  const n = await page.evaluate(async () => ((await (await fetch('/data/albums.json')).json()) as unknown[]).length);
  const classes = Array.from(drawStarClasses(n, seededRandom(SEED)));
  const points = await page.evaluate((cls) => {
    const api = window.__rmr!.map!;
    const focus = new Set((window.__rmr!.markerLayout?.()?.placed ?? []).map((m) => m.id));
    const covers = [...document.querySelectorAll('.mk')].map((e) => e.getBoundingClientRect());
    const all: { id: number; x: number; y: number }[] = [];
    for (let id = 0; id < cls.length; id++) {
      const p = api.screenPoint(id);
      if (p && p.x > 0 && p.y > 0 && p.x < innerWidth && p.y < innerHeight) all.push({ id, x: p.x, y: p.y });
    }
    return {
      focus: focus.size,
      points: all.filter((p) => {
        if (cls[p.id] !== 3 || focus.has(p.id)) return false;
        if (p.x < 20 || p.y < 20 || p.x > innerWidth - 20 || p.y > innerHeight - 20) return false;
        if (covers.some((r) => p.x > r.left - 40 && p.x < r.right + 40 && p.y > r.top - 40 && p.y < r.bottom + 40)) return false;
        if (all.some((q) => q.id !== p.id && Math.hypot(q.x - p.x, q.y - p.y) < 16)) return false;
        for (const [dx, dy] of [[0, 0], [-12, -12], [12, -12], [-12, 12], [12, 12]]) {
          if (!document.elementFromPoint(p.x + dx, p.y + dy)?.classList.contains('map-canvas')) return false;
        }
        return true;
      }),
    };
  }, classes);
  expect(points.focus, 'albums in the open focus').toBeGreaterThan(1);
  expect(points.points.length, 'small stars on the bare map beside the album').toBeGreaterThan(40);

  // Round each: the mean grey of the ring 2.5 to 3.6 px from its centre (outside a small star's core, which is
  // under 1.8 px here; inside a disc of the dot size, 7 to 8 px across) less that of the ring 7 to 9 px out
  // (the map beside it). A flat disc of the star colour lifts the near ring by about 50 of 255 (measured before
  // the fix: median 49.5, nine in ten under 60.9). A point of light leaves only its glow and the first trace of
  // its cover there: 11.7 and 17.6 with the tile brought in by the cover fade at 24.39 px covers (7.3 and 11.8 at
  // 19.80 px, which is the look of the approved picture). The bounds sit between the two, about a quarter of the
  // disc's.
  const png = (await page.screenshot()).toString('base64');
  const lift = await page.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const out: number[] = [];
      for (const p of list) {
        const R = 10;
        const x0 = Math.round(p.x * k) - R;
        const y0 = Math.round(p.y * k) - R;
        const d = ctx.getImageData(x0, y0, 2 * R + 1, 2 * R + 1).data;
        let near = 0;
        let nearN = 0;
        let far = 0;
        let farN = 0;
        for (let y = 0; y <= 2 * R; y++) {
          for (let x = 0; x <= 2 * R; x++) {
            const r = Math.hypot(x0 + x + 0.5 - p.x * k, y0 + y + 0.5 - p.y * k) / k;
            const i = 4 * (y * (2 * R + 1) + x);
            const grey = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            if (r >= 2.5 && r <= 3.6) {
              near += grey;
              nearN++;
            } else if (r >= 7 && r <= 9) {
              far += grey;
              farN++;
            }
          }
        }
        out.push(near / nearN - far / farN);
      }
      return out.sort((a, b) => a - b);
    },
    [png, points.points] as const,
  );
  const median = lift[Math.floor(lift.length / 2)];
  const upper = lift[Math.floor(lift.length * 0.9)];
  console.log(`stars beside the open album: covers ${coverPx.toFixed(2)} px, ${lift.length} small stars, near ring less far ring: median ${median.toFixed(2)}, 90th percentile ${upper.toFixed(2)} (of 255)`);
  expect(median, 'median lift of the ring 2.5 to 3.6 px from a small star over the map beside it, of 255').toBeLessThan(12);
  expect(upper, '90th percentile of that lift').toBeLessThan(20);
});
