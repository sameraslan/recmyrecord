import { expect, test, type Page } from '@playwright/test';
import { twinkleOff, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

const IR = '/album/in-rainbows-radiohead';
const GLINT = '.tw-layer .tw';

const stats = (page: Page) => page.evaluate(() => ({ ...window.__rmr!.twinkle!.stats }));
/** The frame counter the idle checks use (canvas/FrameCounter.tsx): one count per frame the map canvas draws. */
const frames = (page: Page) => page.evaluate(() => window.__rmr!.frames ?? 0);

/** The test browser draws in software, where the app plays no glints (state/twinkle.ts twinkleShown): every test
 * here but the one about that rule says 'on' before the page loads, which is how a browser with a GPU behaves. */
const NO_SWITCH = 'on a software renderer there are no glints unless the switch says on';
test.beforeEach(async ({ page }, info) => {
  if (info.title.startsWith(NO_SWITCH)) return;
  await page.addInitScript(() => {
    window.__rmrTwinkle = 'on';
  });
});

async function openAtRest(page: Page, url = '/map'): Promise<void> {
  await page.goto(url);
  await waitForMap(page);
  await waitForCameraIdle(page);
  // The names' face has arrived and been measured: nothing is left that could ask the canvas for a late frame.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForMapQuiet(page, 400);
  // Part 1's sharper gas image (desktops with a real GPU) fades in about a second after the map settles; wait for
  // it, so the frame counts below see only what the glints do. On the test browser its flag says 'waiting' or 'off'.
  await waitForGasSharpSettled(page);
}

test('glints play on the resting map and the canvas does not draw one frame for them', async ({ page }) => {
  await openAtRest(page);
  const s0 = await stats(page);
  const f0 = await frames(page);
  // Three more glints: at one every 1.2 to 3 s that is under 10 s.
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThanOrEqual(s0.spawned + 3);
  // Long enough for the first of them to have played to its end.
  await expect.poll(async () => (await stats(page)).played, { timeout: 10_000, intervals: [250] }).toBeGreaterThan(s0.played);
  expect((await frames(page)) - f0).toBe(0);
  const s1 = await stats(page);
  expect(s1.alive).toBeLessThanOrEqual(3);
  expect(await page.locator(GLINT).count()).toBeLessThanOrEqual(3);
  // The star pick and the DOM write together stay far under one frame.
  expect(s1.worstSpawnMs).toBeLessThan(16);
});

test('a glint sits on an album star, is two nodes, and takes no pointer events', async ({ page }) => {
  await openAtRest(page);
  const seen = await page.waitForFunction(
    () => {
      const g = document.querySelector<HTMLElement>('.tw-layer .tw');
      if (!g) return null;
      const r = g.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const star = window.__rmr!.map!.screenPoint(Number(g.dataset.album));
      const top = document.elementFromPoint(cx, cy);
      return {
        album: g.dataset.album ?? '',
        off: star ? Math.hypot(star.x - cx, star.y - cy) : 999,
        size: r.width,
        nodes: g.querySelectorAll('*').length + 1,
        hitIsGlint: !!top?.closest('.tw-layer'),
        pointerEvents: getComputedStyle(g).pointerEvents,
        layerPointerEvents: getComputedStyle(g.parentElement!).pointerEvents,
        hidden: g.closest('[aria-hidden="true"]') !== null,
        animated: getComputedStyle(g.firstElementChild!).animationName,
      };
    },
    null,
    { timeout: 20_000, polling: 100 },
  );
  const g = await seen.jsonValue();
  const albums: unknown[] = await page.evaluate(async () => (await fetch('/data/albums.json')).json());
  // Every star is an album, and a glint is not a new star: it carries an album's index and is centred on it.
  expect(Number(g!.album)).toBeGreaterThanOrEqual(0);
  expect(Number(g!.album)).toBeLessThan(albums.length);
  expect(g!.off).toBeLessThanOrEqual(1);
  // 18.8 px across on the smallest star at the whole-map zoom, up to about 43 px on the brightest closer in.
  expect(g!.size).toBeGreaterThanOrEqual(18);
  expect(g!.size).toBeLessThanOrEqual(46);
  expect(g!.nodes).toBe(2);
  expect(g!.hitIsGlint).toBe(false);
  expect(g!.pointerEvents).toBe('none');
  expect(g!.layerPointerEvents).toBe('none');
  expect(g!.hidden).toBe(true);
  expect(g!.animated).toBe('tw-glint');
});

test('a pan clears the glints at once and none is made while the map moves', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await openAtRest(page);
  await page.waitForFunction(() => document.querySelectorAll('.tw-layer .tw').length > 0, null, { timeout: 20_000, polling: 100 });
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2 + 30, vp.height / 2 + 10, { steps: 3 });
  await expect(page.locator(GLINT)).toHaveCount(0);
  const during = (await stats(page)).spawned;
  // Keep panning for 4 s: longer than the longest wait between two glints.
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(vp.width / 2 + 30 + (i % 2 ? 40 : -40), vp.height / 2 + 10 + (i % 3) * 8, { steps: 2 });
    await page.waitForTimeout(100);
  }
  expect((await stats(page)).spawned).toBe(during);
  await expect(page.locator(GLINT)).toHaveCount(0);
  await page.mouse.up();
  await waitForCameraIdle(page);
  // At rest again, they come back.
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(during);
});

test('no glints once covers show', async ({ page }) => {
  await openAtRest(page);
  await page.locator('canvas.map-canvas').focus();
  // Zoom in until covers show (the Explore hint is marked data-zoomed once the cover fade passes a quarter).
  for (let i = 0; i < 14 && (await page.locator('.map-hint').getAttribute('data-zoomed')) !== '1'; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect(page.locator('.map-hint')).toHaveAttribute('data-zoomed', '1');
  await waitForMapQuiet(page, 400);
  await expect(page.locator(GLINT)).toHaveCount(0);
  const before = await stats(page);
  await page.waitForTimeout(7000); // at least two ticks of the timer
  const after = await stats(page);
  expect(after.spawned).toBe(before.spawned);
  expect(after.notResting).toBeGreaterThan(before.notResting);
  await expect(page.locator(GLINT)).toHaveCount(0);
});

test('no glints under reduced motion: the timer never starts and the layer is not shown', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAtRest(page);
  await page.waitForTimeout(7000);
  const s = await stats(page);
  expect(s.ticks).toBe(0);
  expect(s.spawned).toBe(0);
  expect(await page.locator('.tw-layer').evaluate((el) => getComputedStyle(el).display)).toBe('none');
});

test('no glints in a hidden tab, and they return when it shows again', async ({ page }) => {
  await openAtRest(page);
  await page.waitForFunction(() => document.querySelectorAll('.tw-layer .tw').length > 0, null, { timeout: 20_000, polling: 100 });
  // A headless page cannot be put in the background: stand in for it by answering `hidden` and sending the event.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator(GLINT)).toHaveCount(0);
  const before = await stats(page);
  await page.waitForTimeout(7000);
  const after = await stats(page);
  expect(after.ticks).toBe(before.ticks);
  expect(after.spawned).toBe(before.spawned);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(after.spawned);
});

test('beside an open album glints are quieter and never under a cover; the phone album list has none', async ({ page, isMobile }) => {
  // On the desktop project's 1440 x 900 this album is framed with covers of 16.5 px, just past the 16 px at which
  // covers begin to show and the glints stop (the test above), so nothing would play there. At 1280 x 720 the same
  // framing rests at 11.7 px: stars, with the album's covers over them. The size is checked below, not assumed.
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 720 });
  await openAtRest(page, IR);
  if (isMobile) {
    // The list covers the map: the timer ticks but makes nothing.
    await page.waitForTimeout(7000);
    expect((await stats(page)).spawned).toBe(0);
    await expect(page.locator(GLINT)).toHaveCount(0);
    return;
  }
  await expect(page.locator('.mk')).not.toHaveCount(0);
  // Cover size on the map, CSS px: 0.0068 world units (state/zoomLimits.ts COVER_WORLD) at the camera's scale.
  const coverPx = await page.evaluate(() => (0.0068 * document.querySelector('canvas.map-canvas')!.clientHeight * window.__rmr!.map!.getCamera().zoom) / 1.1);
  expect(coverPx).toBeLessThan(16);
  // Sample the glints of 12 s: each one's peak, and whether its star lies under a focus cover.
  const samples = await page.evaluate(async () => {
    const out: { peak: string; underCover: boolean }[] = [];
    const seenEls = new Set<Element>();
    const t0 = performance.now();
    while (performance.now() - t0 < 12_000) {
      for (const g of document.querySelectorAll<HTMLElement>('.tw-layer .tw')) {
        if (seenEls.has(g)) continue;
        seenEls.add(g);
        const r = g.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const underCover = [...document.querySelectorAll('.mk')].some((m) => {
          const b = m.getBoundingClientRect();
          return cx > b.left && cx < b.right && cy > b.top && cy < b.bottom;
        });
        out.push({ peak: (g.firstElementChild as HTMLElement).style.getPropertyValue('--peak'), underCover });
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return out;
  });
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter((s) => s.underCover)).toEqual([]);
  expect([...new Set(samples.map((s) => s.peak))]).toEqual(['0.60']);
});

test('About shows no glints', async ({ page }) => {
  await page.goto('/about');
  await waitForMap(page);
  await waitForMapQuiet(page, 400);
  await page.waitForTimeout(7000);
  expect((await stats(page)).spawned).toBe(0);
  expect(await page.locator('.tw-layer').evaluate((el) => getComputedStyle(el).display)).toBe('none');
});

test('twinkleOff takes the playing glints out at once, makes no more, and draws no canvas frame', async ({ page }) => {
  await openAtRest(page);
  await page.waitForFunction(() => document.querySelectorAll('.tw-layer .tw').length > 0, null, { timeout: 20_000, polling: 100 });
  const f0 = await frames(page);
  await twinkleOff(page);
  // Read in the very next call: nothing is left, with no wait for a timer or a frame.
  expect(await page.evaluate(() => document.querySelectorAll('.tw-layer .tw').length)).toBe(0);
  expect(await page.evaluate(() => window.__rmr!.twinkle!.enabled())).toBe(false);
  const before = await stats(page);
  expect(before.alive).toBe(0);
  await page.waitForTimeout(7000); // at least two waits of the timer
  const after = await stats(page);
  expect(after.ticks).toBe(before.ticks);
  expect(after.spawned).toBe(before.spawned);
  await expect(page.locator(GLINT)).toHaveCount(0);
  expect((await frames(page)) - f0).toBe(0);
});

test('set before the map loads, the switch keeps the glints off from the start, and they play once it says on', async ({ page }) => {
  await page.addInitScript(() => {
    window.__rmrTwinkle = 'off';
  });
  await openAtRest(page);
  expect(await page.evaluate(() => window.__rmr!.twinkle!.enabled())).toBe(false);
  await page.waitForTimeout(7000);
  const s = await stats(page);
  expect(s.ticks).toBe(0);
  expect(s.spawned).toBe(0);
  await expect(page.locator(GLINT)).toHaveCount(0);
  await page.evaluate(() => {
    window.__rmrTwinkle = 'on';
  });
  expect(await page.evaluate(() => window.__rmr!.twinkle!.enabled())).toBe(true);
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(0);
});

test('on a software renderer there are no glints unless the switch says on (they cost long frames there)', async ({ page }) => {
  // This test alone loads the page as a visitor does: with no switch set.
  await openAtRest(page);
  // The gas layer's own renderer test (canvas/GasField.tsx): true on the test browser, which draws in software.
  test.skip((await page.evaluate(() => window.__rmr!.gasLite)) !== true, 'this browser draws on a GPU: glints play by default');
  expect(await page.evaluate(() => window.__rmrTwinkle)).toBeUndefined();
  const f0 = await frames(page);
  await page.waitForTimeout(8000); // at least two ticks of the timer
  const s = await stats(page);
  expect(s.spawned).toBe(0);
  expect(s.ticks).toBeGreaterThanOrEqual(2);
  expect(s.notResting).toBe(s.ticks);
  await expect(page.locator(GLINT)).toHaveCount(0);
  expect((await frames(page)) - f0).toBe(0);
  await page.evaluate(() => {
    window.__rmrTwinkle = 'on';
  });
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(0);
});
