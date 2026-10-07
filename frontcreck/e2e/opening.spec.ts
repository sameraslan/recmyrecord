import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, albumSpread, camera, isPhone, overviewMiss, twinkleOff, waitForCameraIdle, waitForGasSharpSettled, waitForMap, wholeMapMiss } from './helpers';

/** Task 0 of part 2: /map opens at the approved Overview (final-overview.jpg); the fit button gives the Whole map.
 * Zooms recorded in the plan (docs/superpowers/plans/2026-10-05-trifid-theme-2-task0-overview-framing.md) from the
 * committed positions: desktop 1440 x 900 (canvas 836 tall) and phone 390 x 844 (canvas 784 tall), Balanced.
 * Those canvases started below the header. The canvas now runs under it (part 3 Task 3) and a zoom is relative to
 * the canvas height, so the same scale on screen is `zoomAsRecorded`: the camera's zoom times the canvas height
 * over the height of the map below the header (836 and 784 still). */
const OVERVIEW_ZOOM = { desktop: 2.15721, phone: 0.56516 };
const WHOLE_ZOOM = { desktop: 0.78507, phone: 0.37581 };

/** The camera's zoom as a canvas that starts below the header would have it: the scale on screen is the same. */
async function zoomAsRecorded(page: Page, zoom: number): Promise<number> {
  const k = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.map-canvas')!.getBoundingClientRect();
    return canvas.height / (canvas.bottom - document.querySelector('#stage')!.getBoundingClientRect().top);
  });
  return zoom * k;
}

async function openMap(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
}

const same = (a: { x: number; y: number; zoom: number }, b: { x: number; y: number; zoom: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.zoom - b.zoom);

test('/map opens at the Overview: the 1st to 99th percentile span fills the pane less 24 px a side, the median row in the middle', async ({ page }, info) => {
  await openMap(page);
  const s = await albumSpread(page);
  expect(overviewMiss(s)).toEqual([]);
  const z = await zoomAsRecorded(page, (await camera(page)).zoom);
  expect(z).toBeCloseTo(OVERVIEW_ZOOM[isPhone(info) ? 'phone' : 'desktop'], 3);
  // covers stay dots and the gas is full: under 13 px (12.5 at most). `z` is the zoom of a canvas as tall as the
  // map below the header, which is `h`.
  const h = s.bottom - s.top;
  expect((z * h) / 1.1 * 0.0068).toBeLessThan(12.5 + 1e-6);
});

test('the fit button gives the Whole map, and pressing it again stays there', async ({ page, isMobile }, info) => {
  await openMap(page);
  const opened = await camera(page);
  await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
  await waitForCameraIdle(page);
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  expect(await zoomAsRecorded(page, whole.zoom)).toBeCloseTo(WHOLE_ZOOM[isPhone(info) ? 'phone' : 'desktop'], 3);
  expect(whole.zoom).toBeLessThan(opened.zoom);
  await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
  await waitForCameraIdle(page);
  expect(same(await camera(page), whole)).toBeLessThan(1e-6);
  if (!isMobile) {
    // the 0 key is the fit button
    await page.locator('canvas.map-canvas').focus();
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
    await page.keyboard.press('0');
    await waitForCameraIdle(page);
    expect(same(await camera(page), whole)).toBeLessThan(1e-6);
  }
});

test('the opening switch gives back the old opening view exactly: the fit button\'s Whole map', async ({ page, isMobile }) => {
  await openMap(page);
  await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
  await waitForCameraIdle(page);
  const fit = await camera(page);
  await page.addInitScript(() => {
    window.__rmrOpen = 'whole';
  });
  await openMap(page);
  expect(same(await camera(page), fit)).toBeLessThan(1e-6);
});

test('an album link opens on the album whatever the opening switch says', async ({ page, isMobile }) => {
  const openAlbum = async () => {
    await page.goto('/album/in-rainbows-radiohead');
    await waitForMap(page);
    if (isMobile) {
      await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
      await waitForMap(page);
    }
    await expect(page.locator('.mk')).toHaveCount(6);
    await waitForCameraIdle(page);
    return camera(page);
  };
  const plain = await openAlbum();
  await page.addInitScript(() => {
    window.__rmrOpen = 'overview';
  });
  const switched = await openAlbum();
  expect(same(switched, plain)).toBeLessThan(1e-6);
  // and it is the album's own framing, not the Overview's
  expect(Math.abs((await zoomAsRecorded(page, plain.zoom)) - OVERVIEW_ZOOM[isMobile ? 'phone' : 'desktop'])).toBeGreaterThan(0.05);
});

test('from Home the map link glides to the Overview; a camera saved in Explore is kept', async ({ page, isMobile }) => {
  await page.goto('/');
  await waitForMap(page);
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForMap(page); // the gas flag drops to 'loading' when Home turns into the map
  await waitForCameraIdle(page);
  expect(overviewMiss(await albumSpread(page))).toEqual([]);
  // The visitor zooms, leaves for About and comes back: the map is where they left it, not the Overview again.
  await act(page.getByRole('button', { name: COPY.map.zoomIn }), isMobile);
  await waitForCameraIdle(page);
  const left = await camera(page);
  await act(nav.getByRole('link', { name: COPY.nav.about, exact: true }), isMobile);
  await expect(page).toHaveURL('/about');
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page).toHaveURL('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(same(await camera(page), left)).toBeLessThan(1e-6);
});

test('/map to Home with the Overview untouched shows Home\'s Whole map, and the Map link opens at the Overview again; a moved camera stays', async ({ page, isMobile }) => {
  // Home's own framing (final-home.jpg): a fresh load of Home.
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const homeFresh = await camera(page);
  await openMap(page);
  await act(page.locator('a.wordmark'), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await waitForMap(page);
  await waitForCameraIdle(page);
  // The same zoom, and the same centre to under a pixel: on a phone the whole fit published on /map may carry the
  // measured slider cover (164.5 px) where a fresh Home has the fallback (165), a 0.25 px shift of the centre.
  const back = await camera(page);
  const canvasH = await page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().height);
  expect(Math.abs(back.zoom - homeFresh.zoom)).toBeLessThan(1e-6);
  expect(Math.hypot(back.x - homeFresh.x, back.y - homeFresh.y) * ((homeFresh.zoom * canvasH) / 1.1)).toBeLessThan(1);
  expect(wholeMapMiss(await albumSpread(page), isMobile)).toEqual([]);
  // Nothing was saved: the Map link opens at the Overview again.
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(overviewMiss(await albumSpread(page))).toEqual([]);
  // Moved by the visitor: Home keeps the camera, as today.
  await act(page.getByRole('button', { name: COPY.map.zoomIn }), isMobile);
  await waitForCameraIdle(page);
  const moved = await camera(page);
  await act(page.locator('a.wordmark'), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(same(await camera(page), moved)).toBeLessThan(1e-6);
});

/** Home's own framing, as a fresh load of Home frames it, and a check that `page` shows it now (same zoom, centre
 * within a pixel: on a phone the whole fit published on /map may carry the measured slider cover). */
async function freshHome(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  return camera(page);
}
async function expectHomeFraming(page: Page, home: { x: number; y: number; zoom: number }, phone: boolean): Promise<void> {
  const now = await camera(page);
  const canvasH = await page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().height);
  expect(Math.abs(now.zoom - home.zoom)).toBeLessThan(1e-6);
  expect(Math.hypot(now.x - home.x, now.y - home.y) * ((home.zoom * canvasH) / 1.1)).toBeLessThan(1);
  expect(wholeMapMiss(await albumSpread(page), phone)).toEqual([]);
}

test('/map (untouched) to About and then Home shows Home\'s Whole map, and the Map link opens at the Overview again', async ({ page, isMobile }) => {
  const home = await freshHome(page);
  await openMap(page);
  const opened = await camera(page);
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await act(nav.getByRole('link', { name: COPY.nav.about, exact: true }), isMobile);
  await expect(page).toHaveURL('/about');
  await waitForMap(page);
  await waitForCameraIdle(page);
  // About keeps the camera, as today.
  expect(same(await camera(page), opened)).toBeLessThan(1e-6);
  await act(page.locator('a.wordmark'), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expectHomeFraming(page, home, isMobile);
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(overviewMiss(await albumSpread(page))).toEqual([]);
});

test('Home clicked while the glide to the Overview is still running counts as untouched: Home\'s Whole map, nothing saved', async ({ page, isMobile }) => {
  const home = await freshHome(page);
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  // In the page, so no round trip can let the 420 ms glide end first: once the map shows Explore and the glide is
  // running, follow the wordmark in the same frame.
  const glideRunning = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const t0 = performance.now();
        const tick = () => {
          const explore = document.querySelector('.map-pane')?.getAttribute('data-view') === 'explore';
          if (explore && window.__rmr?.map?.isAnimating()) {
            document.querySelector<HTMLAnchorElement>('a.wordmark')!.click();
            resolve(true);
          } else if (performance.now() - t0 > 10_000) resolve(false);
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  expect(glideRunning, 'the glide to the Overview was running when Home was clicked').toBe(true);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expectHomeFraming(page, home, isMobile);
  // No half-way camera was saved: the Map link glides to the Overview again.
  await act(nav.getByRole('link', { name: COPY.nav.map, exact: true }), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(overviewMiss(await albumSpread(page))).toEqual([]);
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop framing');

  test('after the Overview glided back to Home, a resize on Home fits the Whole map, as a fresh load of Home at that size', async ({ page }) => {
    const canvasWidth = () => page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().width);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const homeAt1280 = await camera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page);
    await page.locator('a.wordmark').click();
    await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(canvasWidth).toBe(1280);
    await waitForCameraIdle(page);
    expect(same(await camera(page), homeAt1280)).toBeLessThan(1e-6);
  });

  test('after a pick\'s fly on /map, a resize on Home fits the Whole map, as a fresh load of Home at that size', async ({ page }) => {
    // A pick flies the camera without a camera grab (MapStage calls the map's flyTo), so the camera counts as
    // untouched and a resize re-fits it. On Home that must be Home's own Whole map, never the Overview (state/view.ts
    // snapKind). The fly is called through the map API, the call a pick makes: a click on the canvas would itself
    // be a grab, and then no resize re-fits anything.
    const canvasWidth = () => page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().width);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const homeAt1280 = await camera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMap(page);
    const opened = await camera(page);
    await page.evaluate(() => window.__rmr!.map!.flyTo(11));
    await waitForCameraIdle(page);
    expect(same(await camera(page), opened), 'the fly moved the camera').toBeGreaterThan(1e-3);
    await page.locator('a.wordmark').click();
    await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(canvasWidth).toBe(1280);
    await waitForCameraIdle(page);
    expect(same(await camera(page), homeAt1280)).toBeLessThan(1e-6);
  });

  test('on a desktop with a GPU the Overview asks for the sharper gas image without a zoom, and its fade ends', async ({ page }) => {
    test.setTimeout(90_000); // up to 20 s for the request and 30 s for the upload on the software renderer, as gas.spec's sharper image tests
    const theme = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/data/theme/theme.json'), 'utf8')) as { gas: Record<string, { hash: [string, string] }> };
    const sharpUrl = `/data/theme/gas-balanced-sharp.${theme.gas.balanced.hash[1]}.webp`;
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off';
      window.__rmrGasSharp = 'force'; // the test browser is a software renderer, which would not ask by itself
    });
    const sharpRequests: string[] = [];
    page.on('request', (r) => {
      if (/-sharp\./.test(r.url())) sharpRequests.push(new URL(r.url()).pathname);
    });
    await openMap(page);
    const opened = await camera(page);
    // 950 px per raw unit at the Overview against 700 texels in Balanced's first image (the Whole map: 346)
    await expect.poll(() => sharpRequests, { timeout: 20_000 }).toEqual([sharpUrl]);
    await expect.poll(() => page.evaluate(() => window.__rmr!.gasSharp), { timeout: 30_000 }).toBe('balanced');
    await waitForGasSharpSettled(page);
    expect(same(await camera(page), opened), 'no camera move').toBeLessThan(1e-6);
    const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
    await page.waitForTimeout(1000);
    expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBe(0);
    expect(sharpRequests).toEqual([sharpUrl]);
  });

  test('a resize before the map is touched re-fits the Overview; after the fit button it re-fits the Whole map', async ({ page }) => {
    await openMap(page);
    const canvasWidth = () => page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().width);
    await page.setViewportSize({ width: 1280, height: 800 });
    // R3F sees the new size through a ResizeObserver: wait for it before waiting for the camera
    await expect.poll(canvasWidth).toBe(1280);
    await waitForCameraIdle(page);
    expect(overviewMiss(await albumSpread(page))).toEqual([]);
    await page.getByRole('button', { name: COPY.map.reset }).click();
    await waitForCameraIdle(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect.poll(canvasWidth).toBe(1440);
    await waitForCameraIdle(page);
    expect(wholeMapMiss(await albumSpread(page), false)).toEqual([]);
  });

  test('the gas fills the screen at the Overview, the Whole map leaves sky beside it, and nothing draws at rest', async ({ page }) => {
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off'; // the full shader, as gas.spec.ts reads the gas
    });
    await openMap(page);
    expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
    const grid = async (): Promise<number[]> => {
      const vp = page.viewportSize()!;
      const out: number[] = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) out.push(await medianLuma(page, { x: 200 + (i * (vp.width - 520)) / 3, y: 160 + (j * (vp.height - 440)) / 2, w: 120, h: 120 }));
      return out;
    };
    const overview = await grid();
    overview.forEach((v, i) => expect(v, `patch ${i} at the Overview: ${overview.map((x) => x.toFixed(1)).join(', ')}`).toBeGreaterThan(SKY_LUMA + 4));
    await waitForGasSharpSettled(page);
    const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
    await page.waitForTimeout(1200);
    expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: COPY.map.reset }).click();
    await waitForCameraIdle(page);
    const whole = await grid();
    expect(whole.filter((v) => v <= SKY_LUMA + 4).length, `patches at the Whole map: ${whole.map((x) => x.toFixed(1)).join(', ')}`).toBeGreaterThanOrEqual(2);
  });
});

/** Luma of the empty sky, rgb(6, 6, 9) (gas.spec.ts SKY_LUMA). */
const SKY_LUMA = 6.2;

/** Median luma of a client-px rectangle of a screenshot (gas.spec.ts lumaAt with q = 0.5). */
async function medianLuma(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<number> {
  // A star glint is a bright spot at a random place and time: none while pixels are read.
  await twinkleOff(page);
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rect]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const d = ctx.getImageData(Math.round(rect.x * k), Math.round(rect.y * k), Math.round(rect.w * k), Math.round(rect.h * k)).data;
      const l: number[] = [];
      for (let i = 0; i < d.length; i += 4) l.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      l.sort((a, b) => a - b);
      return l[Math.floor((l.length - 1) / 2)];
    },
    [png, r] as const,
  );
}
