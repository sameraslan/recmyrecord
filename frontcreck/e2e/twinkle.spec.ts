import { expect, test, type Page } from '@playwright/test';
import { twinkleOff, visibleAlbumPoint, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

const IR = '/album/in-rainbows-radiohead';
const GLINT = '.tw-layer .tw';

const stats = (page: Page) => page.evaluate(() => ({ ...window.__rmr!.twinkle!.stats }));
/** The frame counter the idle checks use (canvas/FrameCounter.tsx): one count per frame the map canvas draws. */
const frames = (page: Page) => page.evaluate(() => window.__rmr!.frames ?? 0);

/** The test browser draws in software, where the app plays no glints (state/twinkle.ts twinkleShown): every test
 * here but the ones about that rule says 'on' before the page loads. That is a forced state no visitor has (a
 * software renderer with glints); it is the only way this browser shows what a browser with a GPU does. */
const NO_SWITCH = 'on a software renderer there are no glints';

/** A glint that began less than `maxAgeMs` ago is on the page: what follows has more than a second before it
 * would end by itself. Gives the number of times the layer had been cleared by then. */
async function freshGlint(page: Page, maxAgeMs = 400): Promise<number> {
  const h = await page.waitForFunction(
    (maxAge) => {
      for (const b of document.querySelectorAll('.tw-layer .tw b')) {
        const t = b.getAnimations()[0]?.currentTime;
        if (typeof t === 'number' && t < maxAge) return { cleared: window.__rmr!.twinkle!.stats.cleared };
      }
      return null;
    },
    maxAgeMs,
    { timeout: 30_000, polling: 50 },
  );
  return (await h.jsonValue())!.cleared;
}
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
  // The star pick, the read of the glass surfaces' boxes and the DOM write together: half a frame at 60 Hz, the
  // kill rule's own number (scripts/perf/twinkle-cost.mjs SPAWN_LIMIT_MS).
  console.log(`twinkle: longest glint write ${s1.worstSpawnMs} ms`);
  expect(s1.worstSpawnMs).toBeLessThan(8);
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
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 2);
  // A glint that has more than a second left to play: if the pan did not clear it, it would still be there.
  const cleared0 = await freshGlint(page);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2 + 30, vp.height / 2 + 10, { steps: 3 });
  // Two frames on (the pan's own), read in one call with no retry: the layer is empty because it was cleared,
  // not because the glint played out.
  const at = await page.evaluate(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return { count: document.querySelectorAll('.tw-layer .tw').length, cleared: window.__rmr!.twinkle!.stats.cleared, alive: window.__rmr!.twinkle!.stats.alive };
  });
  expect(at).toEqual({ count: 0, cleared: cleared0 + 1, alive: 0 });
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
  let steps = 0;
  for (; steps < 14 && (await page.locator('.map-hint').getAttribute('data-zoomed')) !== '1'; steps++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect(page.locator('.map-hint')).toHaveAttribute('data-zoomed', '1');
  await waitForMapQuiet(page, 400);
  await expect(page.locator(GLINT)).toHaveCount(0);
  // The timer has stopped: not one tick in 7 s (two waits and more), where it used to tick and make nothing.
  const before = await stats(page);
  await page.waitForTimeout(7000);
  const after = await stats(page);
  expect(after.spawned).toBe(before.spawned);
  expect(after.ticks).toBe(before.ticks);
  await expect(page.locator(GLINT)).toHaveCount(0);
  // Back out by as many steps, to where the test began: stars again.
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('-');
    await waitForCameraIdle(page);
  }
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 30_000, intervals: [250] }).toBeGreaterThan(after.spawned);
});

test('no new glint while an album is hovered or for 500 ms after; the playing ones finish', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse hover');
  await openAtRest(page);
  const at = await visibleAlbumPoint(page);
  const cleared0 = await freshGlint(page);
  await page.mouse.move(at.x - 40, at.y - 40);
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await expect(page.locator('.map-tip')).toHaveCSS('opacity', '1');
  const before = await stats(page);
  // The glint that was playing when the hover began was not taken out for it.
  expect(before.cleared).toBe(cleared0);
  await page.waitForTimeout(7000); // at least two ticks under the hover
  const held = await stats(page);
  expect(held.spawned).toBe(before.spawned);
  expect(held.hoverHeld).toBeGreaterThanOrEqual(before.hoverHeld + 2);
  expect(held.cleared).toBe(cleared0);
  // The glints alive when the hover began played to their end.
  expect(held.played).toBeGreaterThan(0);
  await page.mouse.move(5, 5, { steps: 3 });
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(held.spawned);
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
  const cleared0 = await freshGlint(page);
  // A headless page cannot be put in the background: stand in for it by answering `hidden` and sending the event.
  // The layer is read in the same call, straight after the event: no wait in which a glint could play out.
  const at = await page.evaluate(() => {
    const had = document.querySelectorAll('.tw-layer .tw').length;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    return { had: had > 0, count: document.querySelectorAll('.tw-layer .tw').length, cleared: window.__rmr!.twinkle!.stats.cleared };
  });
  expect(at).toEqual({ had: true, count: 0, cleared: cleared0 + 1 });
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
    // The list covers the map: there is no timer, so not one tick in 7 s.
    const before = await stats(page);
    await page.waitForTimeout(7000);
    const after = await stats(page);
    expect(after.spawned).toBe(0);
    expect(after.ticks).toBe(before.ticks);
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
  // No timer on a page where the map is only the backdrop: not one tick in 7 s.
  const before = await stats(page);
  await page.waitForTimeout(7000);
  const after = await stats(page);
  expect(after.spawned).toBe(0);
  expect(after.ticks).toBe(before.ticks);
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

test('on a software renderer there are no glints and no timer, unless the switch says on (they cost long frames there)', async ({ page }) => {
  // This test loads the page as a visitor does: with no switch set.
  await openAtRest(page);
  // The renderer's own verdict (state/renderer.ts), not which gas shader was chosen.
  test.skip((await page.evaluate(() => window.__rmr!.twinkle!.software())) !== true, 'this browser draws on a GPU: glints play by default');
  expect(await page.evaluate(() => window.__rmrTwinkle)).toBeUndefined();
  const f0 = await frames(page);
  const before = await stats(page);
  await page.waitForTimeout(8000); // two waits of the timer and more
  const s = await stats(page);
  expect(s.spawned).toBe(0);
  // The timer is not running: the renderer was known before its first tick or on it.
  expect(s.ticks).toBe(before.ticks);
  expect(s.ticks).toBeLessThanOrEqual(1);
  await expect(page.locator(GLINT)).toHaveCount(0);
  expect((await frames(page)) - f0).toBe(0);
  await page.evaluate(() => {
    window.__rmrTwinkle = 'on';
  });
  await expect.poll(async () => (await stats(page)).spawned, { timeout: 20_000, intervals: [250] }).toBeGreaterThan(0);
});

test('on a software renderer there are no glints whichever gas shader is drawn (the full one forced here)', async ({ page }) => {
  // What every gas pixel test does: the full gas shader on the software browser. The glints used to take the
  // lighter shader as the sign of a software renderer, so this played them.
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await openAtRest(page);
  test.skip((await page.evaluate(() => window.__rmr!.twinkle!.software())) !== true, 'this browser draws on a GPU: glints play by default');
  expect(await page.evaluate(() => window.__rmr!.gasLite)).toBe(false);
  const before = await stats(page);
  await page.waitForTimeout(8000);
  const s = await stats(page);
  expect(s.spawned).toBe(0);
  expect(s.ticks).toBe(before.ticks);
  await expect(page.locator(GLINT)).toHaveCount(0);
});

/** Every glint of a run with the surfaces it must keep clear of, both read in the same instant. A glint's box is
 * its whole extent: the bloom (its <i>, which the animation never grows past) and the flare's two arms (--fl
 * from tip to tip, through the centre). The surfaces are found two ways that do not use the app's own list:
 * every element whose computed style blurs its backdrop, and the map's chrome by name (also solid on a phone). */
async function sampleGlints(page: Page, want: number, maxMs: number) {
  return page.evaluate(
    async ([count, max]) => {
      type Box = { left: number; top: number; right: number; bottom: number };
      const box = (r: DOMRect): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      const NAMED = 'header.top, .album, .panel, .map-zoom button, .map-names, .map-msg, .fab-map--on';
      const surfaces = (): { what: string; box: Box }[] => {
        const els = new Set<Element>(document.querySelectorAll(NAMED));
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          const blur = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none';
          if (blur !== 'none') els.add(el);
        }
        return [...els]
          .map((el) => ({ what: `${el.tagName.toLowerCase()}.${String(el.className).trim().replace(/\s+/g, '.')}`, box: box(el.getBoundingClientRect()) }))
          .filter((s) => s.box.right > s.box.left && s.box.bottom > s.box.top);
      };
      const seen = new Set<Element>();
      const out: { album: string; flare: boolean; box: Box; under: string[]; gap: number }[] = [];
      const names = new Set<string>();
      const t0 = performance.now();
      while (out.length < count && performance.now() - t0 < max) {
        for (const g of document.querySelectorAll<HTMLElement>('.tw-layer .tw')) {
          if (seen.has(g)) continue;
          seen.add(g);
          const r = g.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const fl = parseFloat((g.firstElementChild as HTMLElement).style.getPropertyValue('--fl')) || 0;
          const reach = Math.max(r.width / 2, r.height / 2, fl / 2);
          const b: Box = { left: cx - reach, top: cy - reach, right: cx + reach, bottom: cy + reach };
          const all = surfaces();
          all.forEach((s) => names.add(s.what));
          const under = all.filter((s) => b.right > s.box.left && b.left < s.box.right && b.bottom > s.box.top && b.top < s.box.bottom).map((s) => s.what);
          // The nearest surface: how far the glint's box is from it (0 when they touch or overlap).
          const gap = Math.min(...all.map((s) => Math.hypot(Math.max(0, s.box.left - b.right, b.left - s.box.right), Math.max(0, s.box.top - b.bottom, b.top - s.box.bottom))));
          out.push({ album: g.dataset.album ?? '', flare: fl > 0, box: b, under, gap });
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return { glints: out, surfaces: [...names].sort(), headerBottom: document.querySelector('header.top')!.getBoundingClientRect().bottom };
    },
    [want, maxMs] as const,
  );
}

for (const where of ['the map', 'an open album at 1280 x 720'] as const) {
  test(`every glint, bloom and flare, stays clear of the header and of every glass surface: ${where}`, async ({ page, isMobile }) => {
    test.skip(isMobile && where !== 'the map', 'a phone shows the album list over the map');
    test.setTimeout(150_000);
    if (where !== 'the map') await page.setViewportSize({ width: 1280, height: 720 });
    await openAtRest(page, where === 'the map' ? '/map' : IR);
    if (where !== 'the map') await expect(page.locator('.mk')).not.toHaveCount(0);
    // At one glint every 1.2 to 3 s, fifteen take about half a minute.
    const run = await sampleGlints(page, 15, 100_000);
    const worst = Math.min(...run.glints.map((g) => g.gap));
    console.log(`twinkle area, ${where}: ${run.glints.length} glints (${run.glints.filter((g) => g.flare).length} with a flare), nearest ${worst.toFixed(1)} px from a surface; surfaces ${run.surfaces.join(' ')}`);
    expect(run.glints.length).toBeGreaterThanOrEqual(15);
    // The check is not empty: the header is there, and so are the map's controls.
    expect(run.surfaces.some((s) => s.startsWith('header.top'))).toBe(true);
    expect(run.surfaces.some((s) => s.includes('map-names') || s.startsWith('button'))).toBe(true);
    expect(run.surfaces.some((s) => s.includes('mode.panel'))).toBe(true);
    if (where !== 'the map') expect(run.surfaces.some((s) => s.includes('album'))).toBe(true);
    for (const g of run.glints) {
      expect(g.under, `the glint on album ${g.album} reaches under a surface`).toEqual([]);
      expect(g.box.top, `the glint on album ${g.album} reaches under the header`).toBeGreaterThanOrEqual(run.headerBottom);
    }
    // And with the clearance the code keeps (22 px, the blur's radius), less 1 px for rounding.
    expect(worst).toBeGreaterThanOrEqual(21);
  });
}
