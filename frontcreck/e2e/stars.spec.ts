import { expect, test, type Page } from '@playwright/test';
import { waitForCameraIdle, waitForMap } from './helpers';

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
