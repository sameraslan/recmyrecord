import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { ATLAS_SHEET_RE, THUMB_SHEET_RE, recsOf } from './data';
import { camera, contrastOverBackdrop, glRenderer, mapFrames, panBrightestGasUnder, shot, twinkleOff, waitForAnimations, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

// The owner's first and last name, stored encoded so this guard never spells them.
const OWNER_NAME_RE = new RegExp(Buffer.from('c2FtZXJ8YXNsYW4=', 'base64').toString('utf8'), 'i');

test.describe('Home', () => {
  test('hero, search, buttons and shelf over the dimmed map', async ({ page, isMobile }, info) => {
    await page.goto('/');
    await expect(page).toHaveTitle('recmyrecord');
    await expect(page.getByRole('heading', { level: 1, name: COPY.hero })).toBeVisible();
    await expect(page.getByText(COPY.heroSub)).toBeVisible();
    const search = page.locator('.hero').getByRole('combobox');
    if (!isMobile) await expect(search).toBeFocused();
    else await expect(search).not.toBeFocused();
    await expect(page.getByRole('link', { name: COPY.home.explore })).toBeVisible();
    await expect(page.getByRole('button', { name: COPY.home.surprise })).toBeVisible();
    const shelf = page.getByRole('list', { name: COPY.home.shelfListLabel });
    // `getByRole` skips links hidden by `display: none` (16 of 24 on phones), so count the elements themselves.
    await expect(shelf.locator('a')).toHaveCount(24);
    const visible = await shelf.locator('a').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
    expect(visible).toBe(isMobile ? 8 : 24);
    await expect(page.locator('.shelf-now')).toContainText(COPY.home.shelfLabel);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await waitForMap(page);
    await expect(page.locator('.map-pane .veil')).toHaveCount(1);
    await waitForMapQuiet(page);
    await waitForAnimations(page);
    await shot(page, info, 'home');
  });

  test('hovering or focusing a cover names it; clicking opens it', async ({ page }) => {
    await page.goto('/');
    const first = page.getByRole('list', { name: COPY.home.shelfListLabel }).getByRole('link').first();
    await first.focus();
    await expect(page.locator('.shelf-now .t')).toHaveText('OK Computer');
    await expect(page.locator('.shelf-now .a')).toHaveText('Radiohead');
    await first.click();
    await expect(page).toHaveURL('/album/ok-computer-radiohead');
  });

  test('Explore the map and Surprise me', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: COPY.home.explore }).click();
    await expect(page).toHaveURL('/map');
    await page.goto('/');
    await page.getByRole('button', { name: COPY.home.surprise }).click();
    await expect(page).toHaveURL(/\/album\/[a-z0-9-]+$/);
  });

  test('clicking empty map area goes to the map', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no empty area beside the hero on a phone');
    await page.goto('/');
    await page.mouse.click(40, 320);
    await expect(page).toHaveURL('/map');
  });

  test('the first load requests no thumbnail sprite and no map atlas, shelf included', async ({ page }) => {
    const heavy: string[] = [];
    page.on('request', (r) => {
      if (THUMB_SHEET_RE.test(r.url()) || ATLAS_SHEET_RE.test(r.url())) heavy.push(r.url());
    });
    await page.goto('/');
    await waitForMap(page);
    // Below-the-fold and hidden (phone) shelf covers too: scroll the page to its end and let lazy images settle.
    await page.locator('.home').evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500); // nothing should happen: no late heavy request once the network is idle
    expect(heavy).toEqual([]);
    const states = await page.locator('.mosaic .cover').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.state));
    expect(states.every((s) => s === 'remote')).toBe(true);
  });

  test('coming back to Home moves focus: the search on desktop, the heading on a phone', async ({ page, isMobile }) => {
    await page.goto('/about');
    await page.getByRole('link', { name: COPY.wordmark }).click();
    await expect(page).toHaveURL('/');
    if (isMobile) await expect(page.getByRole('heading', { level: 1, name: COPY.hero })).toBeFocused();
    else await expect(page.locator('.hero').getByRole('combobox')).toBeFocused();
  });
});

test('About explains the site and closes back', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.about }).click();
  await expect(page).toHaveURL('/about');
  await expect(page).toHaveTitle('About · recmyrecord');
  await expect(page.getByRole('heading', { level: 1, name: COPY.about.title })).toBeFocused();
  await expect(page.getByText(COPY.about.intro)).toBeVisible();
  for (const section of COPY.about.sections) {
    await expect(page.getByRole('heading', { level: 2, name: section.heading })).toBeVisible();
    for (const p of section.body) await expect(page.getByText(p)).toBeVisible();
  }
  await expect(page.getByText(COPY.about.signoff)).toBeVisible();
  await expect(page.getByText(COPY.about.credits)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(OWNER_NAME_RE);
  await waitForMap(page);
  await waitForMapQuiet(page);
  await waitForAnimations(page);
  await shot(page, info, 'about');
  await page.getByRole('button', { name: COPY.about.close, exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/about');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/');
});

test('a press on the backdrop around the About card closes it; a press on the card does not', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the card fills the screen on a phone');
  await page.goto('/');
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.about }).click();
  await expect(page).toHaveURL('/about');
  const card = page.locator('.about');
  await card.click({ position: { x: 60, y: 200 } });
  await expect(page).toHaveURL('/about');
  const box = (await card.boundingBox())!;
  await page.mouse.click(box.x - 60, box.y + 100);
  await expect(page).toHaveURL('/');
});

test('a direct load of About or a 404 leaves focus alone: the first Tab reaches the skip link', async ({ page }) => {
  for (const path of ['/about', '/no-such-page']) {
    await page.goto(path);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: COPY.skip }), path).toBeFocused();
  }
});

test('unknown pages are a 404 with search and a way to the map', async ({ page }, info) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle('Not found · recmyrecord');
  await expect(page.getByRole('heading', { name: COPY.notFound.heading })).toBeVisible();
  await expect(page.getByText(COPY.notFound.sub)).toBeVisible();
  await expect(page.locator('.notfound').getByRole('combobox')).toBeVisible();
  await waitForMap(page);
  await waitForMapQuiet(page);
  await waitForAnimations(page);
  await shot(page, info, 'not-found');
  await page.getByRole('link', { name: COPY.notFound.mapLink }).click();
  await expect(page).toHaveURL('/map');
});

test('a failed data load shows an inline error that retries', async ({ page }) => {
  let fail = true;
  await page.route('**/data/albums.json', (route) => (fail ? route.abort() : route.continue()));
  await page.goto('/map');
  const alert = page.getByRole('alert').filter({ hasText: COPY.error.body });
  await expect(alert).toBeVisible();
  // No hint line over the empty map.
  await expect(page.locator('.map-hint')).toHaveCount(0);
  fail = false;
  await alert.getByRole('button', { name: COPY.error.retry }).click();
  await waitForMap(page);
  await expect(alert).toHaveCount(0);
  await expect(page.locator('.map-hint')).toHaveCount(1);
});

/** Records the album view state once per frame (what is painted, not the store's synchronous steps). */
async function sampleFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __samples: unknown[]; __sampling: boolean };
    w.__samples = [];
    w.__sampling = true;
    const tick = () => {
      if (!w.__sampling) return;
      const s = window.__rmr!.getState();
      w.__samples.push({
        path: location.pathname,
        seed: s.focus?.seed ?? null,
        ambient: s.ambient !== null,
        inset: s.panelInset,
      });
      requestAnimationFrame(tick);
    };
    tick();
  });
}

type Sample = { path: string; seed: number | null; ambient: boolean; inset: number };

async function stopSampling(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __samples: Sample[]; __sampling: boolean };
    w.__sampling = false;
    return w.__samples;
  });
}

test.describe('album to album', () => {
  test('a prefetched navigation never paints a cleared album state', async ({ page, isMobile }) => {
    await page.goto('/album/in-rainbows-radiohead');
    await expect(page.locator('ol.rec-list .rec-main').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().ambient !== null)).toBe(true);
    // Let the visible row links prefetch.
    await page.waitForLoadState('networkidle');
    const row = page.locator('ol.rec-list .rec-main').first();
    const href = (await row.getAttribute('href'))!;
    const seed = await page.evaluate(() => window.__rmr!.getState().focus!.seed);
    await sampleFrames(page);
    await row.click();
    await expect(page).toHaveURL(href);
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().focus?.seed)).not.toBe(seed);
    await page.waitForTimeout(100); // a few more sampled frames after the new focus
    const samples = await stopSampling(page);
    expect(samples.length).toBeGreaterThan(2);
    expect(samples.filter((s) => s.seed === null || !s.ambient || (!isMobile && s.inset === 0))).toEqual([]);
  });

  test('a slow navigation whose prefetch failed keeps the map inset while it waits', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the phone has no map inset');
    // The first row of In Rainbows (balanced, read from the data). Its page prefetch fails and the navigation request is slow; the
    // current panel and the map inset stay until the new album arrives (album pages have no loading boundary).
    const first = recsOf('in-rainbows-radiohead', 'balanced')[0];
    const target = `/album/${encodeURIComponent(first.slug)}`;
    await page.route(
      (url) => url.pathname === target,
      async (route) => {
        const h = route.request().headers();
        if (route.request().resourceType() === 'document') return route.continue();
        if (h['next-router-prefetch']) {
          if ((h['next-router-segment-prefetch'] ?? '').includes('__PAGE__')) return route.abort();
          return route.continue();
        }
        await new Promise((r) => setTimeout(r, 1200));
        await route.continue().catch(() => {});
      },
    );
    await page.goto('/album/in-rainbows-radiohead');
    const row = page.locator('ol.rec-list .rec-main').first();
    await expect(row).toHaveAttribute('href', target);
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().panelInset)).toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    await sampleFrames(page);
    await row.click();
    await expect(page.locator('#seed-title')).toHaveText(first.title, { timeout: 10_000 });
    const samples = await stopSampling(page);
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.filter((s) => s.inset === 0)).toEqual([]);
  });
});

/**
 * The two links under the Home search field are measured on the rectangle of their words (`{ box: 'text' }`), not
 * on their content box as every other text is. Their content box is the 44 px tap target; the words are one 15 px
 * line in the middle of it, and the 14 px or so below the words is behind no glyph. Sizing the dark pad to that
 * empty strip is what dimmed the brightest gas of the approved Home (review of part 3 Task 6, I1 and option C;
 * ruled by the orchestrator). The tap target itself stays 44 px: e2e/phone.spec.ts tests that.
 * Not measured for these two links: the backdrop above and below their line of words inside the tap target.
 */
const HERO_LINKS = ['.hero-row a.textbtn', '.hero-row button.textbtn'];
const boxOf = (selector: string): 'content' | 'text' => (HERO_LINKS.includes(selector) ? 'text' : 'content');
/** The shelf's line names a cover while that cover has the focus or the pointer: its title and artist stand where
 * the caption stood, over the same gas. */
const SHELF_NAMED = ['.shelf-now .t', '.shelf-now .a'];
const HOME_TEXT = ['.hero h1', '.hero .lede', ...HERO_LINKS, '.shelf-now .cap', ...SHELF_NAMED];
/** Puts the shelf's line in the state that shows `selector`: the first cover focused for a title or an artist,
 * no cover focused for the caption (and for every other text). */
async function showShelfLine(page: Page, selector: string): Promise<void> {
  if (SHELF_NAMED.includes(selector)) await page.locator('.mosaic a').first().focus();
  else await page.evaluate(() => (document.activeElement?.closest('.mosaic') ? (document.activeElement as HTMLElement).blur() : undefined));
  await expect(page.locator(selector).first()).toBeVisible();
}
/** Mean luma (0 to 255) of a rectangle of the page as it is painted now. */
async function meanLuma(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number> {
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, png);
}

test('text over the nebula keeps 4.5:1 on Home, About and 404, and Home says nothing about regions', async ({ page }) => {
  // The full gas shader also on the software test browser: the lighter one is dimmer, and would flatter the text.
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  const PAGES: Array<[string, string, string[]]> = [
    ['/', '.home', HOME_TEXT],
    ['/about', '.about', ['.about h1', '.about p', '.about .about-h2', '.about .about-credits']],
    ['/nothing-here', '.notfound', ['.notfound h1', '.notfound-sub', '.notfound .textbtn']],
  ];
  for (const [url, scope, selectors] of PAGES) {
    await page.goto(url);
    await waitForMap(page);
    await waitForMapQuiet(page);
    await waitForAnimations(page);
    // Glints play on Home (part 2, as in the prototype); a bloom must not drift into the screenshot being measured.
    await twinkleOff(page);
    // One at a time, each scrolled into view first (the About card is taller than the screen; the map behind it does
    // not scroll): the helper refuses a rectangle that is cut by the edge of the screenshot.
    const ratios: Array<{ selector: string; ratio: number }> = [];
    for (const selector of selectors) {
      if (url === '/') await showShelfLine(page, selector);
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      ratios.push(...(await contrastOverBackdrop(page, scope, [selector], { box: boxOf(selector) })));
    }
    if (url === '/') console.log(`renderer: ${await glRenderer(page)}`);
    console.log(`contrast over the nebula ${url}: ${ratios.map((r) => `${r.selector} ${r.ratio.toFixed(2)}`).join(', ')}`);
    for (const r of ratios) expect(r.ratio, `${url} ${r.selector}`).toBeGreaterThanOrEqual(4.5);
  }
  await page.goto('/');
  await expect(page.locator('.home')).not.toContainText(/region/i);
});

test('the nebula behind Home, About and 404 costs no frame at rest', async ({ page }) => {
  // The gas is at full strength on these pages (GAS_DIMMED_STRENGTH 1): the canvas must still stand still.
  // This counts draws of the map canvas only (window.__rmr.frames). What the compositor pays for the static blurred
  // pads and the scrims is not counted here; nothing in home.css animates them.
  for (const url of ['/', '/about', '/nothing-here']) {
    await page.goto(url);
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await waitForGasSharpSettled(page);
    const before = await mapFrames(page);
    await page.waitForTimeout(3000);
    expect((await mapFrames(page)) - before, `${url}: frames drawn in 3 idle seconds`).toBe(0);
  }
});

/** The least mean luminance (0 to 1) of the gas under a text after the brightest gas on screen was moved there
 * (panBrightestGasUnder itself throws when the pan stopped short). Sky is about 0.003. Measured, software renderer,
 * desktop / phone: the wide blocks (heading, lede, 404 sub line) 0.15 to 0.26 at the page's zoom and 0.34 to 0.71 at
 * three times it; the short lines (links, caption) 0.26 to 0.68 and 0.50 to 0.94. */
const gasFloor = (selector: string, zoom: 1 | 3): number => (/h1|lede|notfound-sub/.test(selector) ? 0.1 : zoom === 1 ? 0.2 : 0.4);
/** Windows a laptop gives (1440 x 790, 1280 x 720) and a small phone: there Home has its compact hero (home.css). */
const SHORT_DESKTOP = { width: 1280, height: 720 };
const SHORT_PHONE = { width: 360, height: 640 };

/** Moves the brightest gas on screen under each text in turn, at the page's own zoom and at three times it, and
 * measures the text there. The gas under the words after the pan must be at least gasFloor: a pan that the camera
 * clamp stopped short cannot pass on dark sky. */
async function brightestGasContrast(page: Page, url: string, scope: string, selectors: string[], size?: { width: number; height: number }): Promise<void> {
  if (size) await page.setViewportSize(size);
  await page.goto(url);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await twinkleOff(page);
  console.log(`renderer: ${await glRenderer(page)}`);
  const at = size ? ` at ${size.width} x ${size.height}` : '';
  const fresh = await camera(page);
  for (const zoom of [1, 3] as const) {
    if (zoom !== 1) {
      // From the fresh view again, so the zoomed view does not depend on where the last pan ended.
      await page.evaluate((c) => window.__rmr!.map!.setCamera(c, false), fresh);
      await waitForMapQuiet(page, 300);
      const since = await mapFrames(page);
      await page.evaluate((z) => window.__rmr!.map!.zoomBy(z), zoom);
      await waitForCameraIdle(page, { since });
    }
    const out: string[] = [];
    for (const selector of selectors) {
      if (url === '/') await showShelfLine(page, selector);
      // A title or an artist is there only while its cover has the focus, and the pan's own screenshots hide Home,
      // which takes the focus away: the pan is given the words' rectangle, and the cover is focused again after it.
      const named = SHELF_NAMED.includes(selector);
      const words = named
        ? await page.evaluate((sel) => {
            const range = document.createRange();
            range.selectNodeContents(document.querySelector(sel)!);
            const r = range.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }, selector)
        : selector;
      const gas = await panBrightestGasUnder(page, words, `${scope}, header.top`);
      if (named) await showShelfLine(page, selector);
      const [{ ratio }] = await contrastOverBackdrop(page, scope, [selector], { box: boxOf(selector) });
      out.push(`${selector} ${ratio.toFixed(2)} (gas ${gas.toFixed(2)})`);
      expect(gas, `${url}${at} x${zoom} ${selector}: bright gas is under the words`).toBeGreaterThanOrEqual(gasFloor(selector, zoom));
      expect(ratio, `${url}${at} x${zoom} ${selector}`).toBeGreaterThanOrEqual(4.5);
    }
    console.log(`contrast with the brightest gas under the text ${url}${at} x${zoom}: ${out.join(', ')}`);
  }
}

// A fresh load at the project's window size puts one piece of the nebula under each text. Another window size, or
// a moved map, puts another: these two tests put the worst there is (the pads and scrims of home.css were sized on
// this measurement, not on the fresh load).
test('Home text keeps 4.5:1 with the brightest gas on screen moved under it', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await brightestGasContrast(page, '/', '.home', HOME_TEXT);
});

test('Home text keeps 4.5:1 with the brightest gas moved under it in a short window, where the hero is compact', async ({ page, isMobile }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await brightestGasContrast(page, '/', '.home', HOME_TEXT, isMobile ? SHORT_PHONE : SHORT_DESKTOP);
});

test('404 text keeps 4.5:1 with the brightest gas on screen moved under it', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await brightestGasContrast(page, '/nothing-here', '.notfound', ['.notfound h1', '.notfound-sub', '.notfound .textbtn']);
});

test('the pads leave the gas under the hero links bright', async ({ page }) => {
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  // The band of the nebula just under the two links: the hero's width, 60 px tall, from 4 px below the link row.
  // In the approved picture (final-home.jpg) this is the upper edge of the bright core.
  const band = await page.evaluate(() => {
    const row = document.querySelector('.hero-row')!.getBoundingClientRect();
    const hero = document.querySelector('.hero')!.getBoundingClientRect();
    return { x: Math.round(hero.left), y: Math.round(row.bottom + 4), width: Math.round(hero.width), height: 60 };
  });
  // Nothing else is in the band: the shelf starts below it.
  expect((await page.locator('.shelf').boundingBox())!.y).toBeGreaterThan(band.y + band.height);
  const luma = (): Promise<number> => meanLuma(page, band);
  const withPads = await luma();
  const style = await page.addStyleTag({ content: '.hero::before, .hero-row::before { display: none !important; }' });
  const without = await luma();
  await style.evaluate((el) => (el as Element).remove());
  console.log(`gas under the hero links: ${withPads.toFixed(1)} with the pads, ${without.toFixed(1)} without = ${(withPads / without).toFixed(3)}`);
  expect(without, 'the band is gas, not sky').toBeGreaterThan(40);
  // At least 0.8 of what is there without the pads. Measured: 0.87 with the prototype's hero pad plus the small pad
  // behind the links (desktop and phone; 0.88 with the prototype's pad alone, which is the approved picture), and
  // 0.68 when the hero pad was stretched to 28 px below the links at .78 to carry the links' contrast by itself.
  expect(withPads / without).toBeGreaterThanOrEqual(0.8);
});

test('the shelf lets the gas glow behind its caption, down to the first row of covers', async ({ page }) => {
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await twinkleOff(page);
  // The brightest gas on screen behind the caption: in the approved picture (final-home.jpg) the core's lower edge
  // runs on behind the caption and between the covers.
  const gas = await panBrightestGasUnder(page, '.shelf-now .cap', '.home, header.top');
  expect(gas, 'bright gas is behind the caption').toBeGreaterThanOrEqual(0.2);
  // The hero's width, from the shelf's top to the top of the first row of covers.
  const band = await page.evaluate(() => {
    const hero = document.querySelector('.hero')!.getBoundingClientRect();
    const shelf = document.querySelector('.shelf')!.getBoundingClientRect();
    const covers = document.querySelector('.mosaic')!.getBoundingClientRect();
    return { x: Math.round(hero.left), y: Math.round(shelf.top), width: Math.round(hero.width), height: Math.round(covers.top - shelf.top) };
  });
  expect(band.height).toBeGreaterThan(60);
  const shown = await meanLuma(page, band);
  const style = await page.addStyleTag({ content: '.shelf::before, .shelf-now::before { display: none !important; }' });
  const bare = await meanLuma(page, band);
  await style.evaluate((el) => (el as Element).remove());
  console.log(`gas behind the shelf's caption: ${shown.toFixed(1)} with the scrim and the caption's pad, ${bare.toFixed(1)} without = ${(shown / bare).toFixed(3)}`);
  expect(bare, 'the band is gas, not sky').toBeGreaterThan(40);
  // At least 0.45 of what is there without them. Round 1's scrim (.82 across the window's full width, from 30 px
  // into the shelf) left 0.34 on the desktop project. The prototype's scrim with the caption's pad leaves more on
  // a desktop than on a phone, where the pad is most of the band's width: see the log line above.
  expect(shown / bare).toBeGreaterThanOrEqual(0.45);
});

// A laptop window is about 790 px tall (1440 x 900 screen) or 720 (1280 x 800): with a full-size hero and two rows
// of covers the links met the shelf there, and the nebula's core, which the whole-map view puts at about 0.63 of
// the height, was behind the shelf. Two things make the room (home.css). The compact hero: the same hero with a
// smaller heading (on one line in a desktop window) and less room above it. And, by the owner's ruling, one row of
// covers in short windows (a desktop window 860 px tall or less, a phone under 700 px): the lede, the field, both
// links, the caption and the first row are all there; the second row of picks is not shown. Measured with both:
// 259, 193 and 115 px (two rows with the compact hero gave 154, 90 and 31).
for (const size of [
  { width: 1440, height: 790, phone: false, gap: 240, covers: 12 },
  { width: 1280, height: 720, phone: false, gap: 180, covers: 12 },
  { width: 360, height: 640, phone: true, gap: 105, covers: 4 },
]) {
  test(`Home at ${size.width} x ${size.height} keeps bare nebula between the links and the shelf, with one row of covers`, async ({ page, isMobile }) => {
    test.skip(isMobile !== size.phone, size.phone ? 'a phone window' : 'a desktop window');
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await waitForMap(page);
    await waitForAnimations(page);
    const g = await page.evaluate(() => {
      const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const hero = document.querySelector('.hero')!;
      const home = document.querySelector('.home')!;
      const shown = [...document.querySelectorAll('.mosaic a')].filter((a) => a.getClientRects().length > 0).map((a) => a.getBoundingClientRect());
      return {
        gap: top('.shelf').top - top('.hero-row').bottom,
        scroll: home.scrollHeight - home.clientHeight,
        shelfBottom: top('.shelf').bottom,
        headingTop: top('.hero h1').top,
        headingLines: top('.hero h1').height / parseFloat(getComputedStyle(document.querySelector('.hero h1')!).fontSize),
        headingWidth: (() => {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector('.hero h1')!);
          return range.getBoundingClientRect().width;
        })(),
        // The pad's dark shape starts 80 px inside its box (the clear border that holds the blur's halo).
        padTop: hero.getBoundingClientRect().top + parseFloat(getComputedStyle(hero, '::before').top) + 80,
        covers: shown.length,
        rows: new Set(shown.map((r) => Math.round(r.top))).size,
        coverSide: Math.min(...shown.map((r) => Math.min(r.width, r.height))),
        // No cover of the row that is shown is stepped back: the dimmed ones were the second row.
        dimmed: [...document.querySelectorAll('.mosaic .cover')].filter((c) => c.getClientRects().length > 0 && Number(getComputedStyle(c).opacity) < 1).length,
        inDom: document.querySelectorAll('.mosaic a').length,
      };
    });
    console.log(`Home at ${size.width} x ${size.height}: ${g.gap.toFixed(0)} px between the links and the shelf, pad from ${g.padTop.toFixed(0)}, heading from ${g.headingTop.toFixed(0)} (${g.headingWidth.toFixed(0)} px wide), ${g.covers} covers in ${g.rows} row(s) of ${g.coverSide.toFixed(0)} px, scrolls by ${g.scroll}`);
    // Round 1 measured 29 px at 1440 x 790, none at 1280 x 720 (Home scrolled by 22 px) and 2 px at 360 x 640; the
    // compact hero with two rows 154, 90 and 31.
    expect(g.gap).toBeGreaterThanOrEqual(size.gap);
    expect(g.scroll, 'Home fits without scrolling').toBe(0);
    expect(g.shelfBottom).toBeLessThanOrEqual(size.height);
    // The heading starts inside the pad's dark shape, not above it.
    expect(g.padTop).toBeLessThanOrEqual(g.headingTop);
    // One line in a desktop window, inside the hero's 640 px; two on a phone (line-height .98).
    expect(Math.round(g.headingLines), 'lines of the heading').toBe(size.phone ? 2 : 1);
    if (!size.phone) expect(g.headingWidth).toBeLessThanOrEqual(640);
    // One full row: every column of the grid has its cover, all at full strength, each a tap target of 44 px or more.
    expect(g.covers, 'one row of covers').toBe(size.covers);
    expect(g.rows, 'rows of covers').toBe(1);
    expect(g.dimmed, 'covers stepped back').toBe(0);
    expect(g.coverSide).toBeGreaterThanOrEqual(44);
    expect(g.inDom).toBe(24);
    for (const sel of ['.hero h1', '.hero .lede', '.hero .combo-field', ...HERO_LINKS, '.shelf-now .cap', '.mosaic li:first-child a']) await expect(page.locator(sel).first(), sel).toBeInViewport({ ratio: 1 });
  });
}

// Where the one row begins and ends: exactly at the heights where the hero turns compact (860 px in a desktop
// window, 699 px on a phone). One px taller and both rows are there, the second stepped back, as before.
for (const size of [
  { width: 1440, height: 860, phone: false, covers: 12, rows: 1 },
  { width: 1440, height: 861, phone: false, covers: 24, rows: 2 },
  { width: 1000, height: 700, phone: false, covers: 8, rows: 1 },
  { width: 1000, height: 900, phone: false, covers: 16, rows: 2 },
  { width: 360, height: 699, phone: true, covers: 4, rows: 1 },
  { width: 360, height: 700, phone: true, covers: 8, rows: 2 },
  { width: 390, height: 844, phone: true, covers: 8, rows: 2 },
]) {
  test(`Home at ${size.width} x ${size.height} shows ${size.rows === 1 ? 'one row' : 'two rows'} of covers`, async ({ page, isMobile }) => {
    test.skip(isMobile !== size.phone, size.phone ? 'a phone window' : 'a desktop window');
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await expect(page.locator('.mosaic a').first()).toBeVisible();
    const shown = await page.locator('.mosaic a').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(shown.length, 'covers shown').toBe(size.covers);
    expect(new Set(shown).size, 'rows').toBe(size.rows);
  });
}

// The map runs behind Home's clear header, and the Home layer (a scroll container) is clipped at the header's bottom
// edge. Anything of Home that still darkens the gas at that edge is cut there and shows as a horizontal line under
// the bar: the hero pad's blur did, on phones (its top is 22 px below the edge). Phones only: in a desktop window
// the pad starts 8vh below the edge, and the cut is under 3 % even at 560 px of height, less than the header
// scrim's own ramp, so this measurement cannot tell it apart there (the same mask rule covers it; glass.test.ts).
for (const size of [
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test(`Home draws no line under the header at ${size.width} x ${size.height}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a phone window');
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off';
    });
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await twinkleOff(page);
    const edge = await page.evaluate(() => document.querySelector('#stage')!.getBoundingClientRect().top);
    expect(edge).toBeGreaterThan(40);
    // Bright gas across the edge, in the middle 60 % of the window (clear of the wordmark and the header links).
    const strip = { x: Math.round(size.width * 0.2), y: edge - 16, width: Math.round(size.width * 0.6), height: 32 };
    const gas = await panBrightestGasUnder(page, strip, '.home, header.top');
    expect(gas, 'bright gas lies across the header edge').toBeGreaterThanOrEqual(0.1);
    // Mean luma of each device pixel row of the strip with the header and Home on, but without the header's own
    // scrim: its ramp across the edge is smooth, yet steep enough (up to 6 % from row to row) to hide a cut of that
    // size beside it. Without it, what is left at the edge is the gas's own gradient and whatever Home cuts there.
    const noScrim = await page.addStyleTag({ content: 'header.top::before { display: none !important; }' });
    const png = (await page.screenshot({ clip: strip })).toString('base64');
    await noScrim.evaluate((el) => (el as Element).remove());
    const rows = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const out: number[] = [];
      for (let y = 0; y < img.height; y++) {
        const d = ctx.getImageData(0, y, img.width, 1).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        out.push(sum / img.width);
      }
      return out;
    }, png);
    // The step across the edge, as a share of the brightness there, against the largest step between any other two
    // neighbouring rows of the strip (the gas's own gradient). A cut is a step at the edge only. The edge need not
    // fall exactly between the two middle device rows, so the largest of the three steps round the middle is taken
    // as the edge's, and none of them counts among the others. Allowed: one and a half times the largest other step
    // plus 1 %, and never more than 3 %. Measured on the phone project with the header's scrim on, before this
    // test hid it: 13.6 % and 12.5 % at the edge before the fix (5.7 % and 6.3 % elsewhere, the scrim's ramp), 0.2 %
    // and 1.3 % after it. With the scrim hidden: 13.9 % and 28.0 % with the pad's mask taken out (2.9 % and 3.1 %
    // elsewhere), 1.5 % and 1.2 % as built.
    const at = Math.floor(rows.length / 2);
    const step = (i: number) => Math.abs(rows[i] - rows[i - 1]) / Math.max(rows[i], rows[i - 1]);
    const near = [at - 1, at, at + 1];
    const edgeStep = Math.max(...near.map(step));
    const largest = Math.max(...rows.map((_, i) => i).filter((i) => i > 0 && !near.includes(i)).map(step));
    console.log(`header edge at ${size.width} x ${size.height}: step ${(edgeStep * 100).toFixed(1)} %, largest other ${(largest * 100).toFixed(1)} %, rows ${rows[at - 1].toFixed(1)} / ${rows[at].toFixed(1)}, gas ${gas.toFixed(2)}`);
    expect(rows[at], 'the edge rows are lit').toBeGreaterThan(8);
    expect(edgeStep).toBeLessThanOrEqual(Math.min(0.03, 1.5 * largest + 0.01));
  });
}

test('Home shows the nebula nearly as bright as the map does: only the veil dims it', async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  test.skip(isMobile, 'on a phone the hero pad and the shelf leave too little bare nebula to compare');
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
    window.__rmrOpen = 'whole';
  });
  /** The gas in each 40 px cell of the screen: the lower quartile of the cell's luma (0 to 255), which is the
   * nebula between the stars. The stars are drawn fainter on Home than on the map (canvas/AlbumField.tsx), and on
   * the map of 10,467 albums the brightest cells of the whole map hold 100 to 240 of them each (136, 107 and 242
   * a cell at the three sizes), so a cell's mean is as much stars as gas: the means read 0.983, 0.988 and 0.966
   * without the veil, the lower quartiles 0.997, 0.998 and 0.989 (on 4,081 albums the means read 0.996, 0.998
   * and 0.991). */
  const cells = async (): Promise<number[]> => {
    const png = (await page.screenshot()).toString('base64');
    return page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const out: number[] = [];
      for (let y = 0; y + 40 <= img.height; y += 40) {
        for (let x = 0; x + 40 <= img.width; x += 40) {
          const d = ctx.getImageData(x, y, 40, 40).data;
          const luma: number[] = [];
          for (let i = 0; i < d.length; i += 4) luma.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          luma.sort((a, b) => a - b);
          out.push(luma[luma.length / 4]);
        }
      }
      return out;
    }, png);
  };
  const settle = async () => {
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await waitForGasSharpSettled(page);
  };

  // The project's window, the approved picture's and a short laptop window: each frames the nebula differently.
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1600, height: 1000 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/map');
    await settle();
    const mapCamera = await camera(page);
    await page.addStyleTag({ content: '.map-ui, .top { visibility: hidden !important; }' });
    const onMap = await cells();

    await page.goto('/');
    await settle();
    // Without the hero and the shelf (their pad and scrim are pinned in styles/glass.test.ts): the veil stays.
    await page.addStyleTag({ content: '.home, .top { visibility: hidden !important; }' });
    await expect(page.locator('.map-pane .veil')).toBeVisible();
    const homeCamera = await camera(page);
    // The same view of the same nebula, or the comparison means nothing.
    expect(homeCamera.zoom).toBeCloseTo(mapCamera.zoom, 3);
    expect(homeCamera.x).toBeCloseTo(mapCamera.x, 3);
    expect(homeCamera.y).toBeCloseTo(mapCamera.y, 3);
    const onHome = await cells();
    // The twenty brightest cells of the map are gas, not sky: there a dimmer shader shows.
    const brightest = onMap.map((_, i) => i).sort((a, b) => onMap[b] - onMap[a]).slice(0, 20);
    expect(brightest.length).toBe(20);
    const mean = (v: number[]) => brightest.reduce((s, i) => s + v[i], 0) / brightest.length;
    console.log(`nebula on Home against the map at ${size.width} x ${size.height}: ${mean(onHome).toFixed(1)} / ${mean(onMap).toFixed(1)} = ${(mean(onHome) / mean(onMap)).toFixed(3)}`);
    expect(mean(onMap), 'the compared cells are gas').toBeGreaterThan(40);
    // Only the veil is over these cells on Home: a tenth of near black (styles/map.css .veil, pinned in
    // styles/glass.test.ts), so the nebula at full strength reads 0.90 of the map's. Measured: 0.902, 0.902 and
    // 0.896 at the three sizes (as cell means on 4,081 albums: 0.900 at 1440 x 900, 174.0 against 193.4). With
    // the gas at 0.6 of its strength (the dimmed backdrop this replaced) Home's cells were 126.8 there, which is
    // 0.66. The bound is the veil less 0.03 for rounding and the stars, which are dealt afresh on each load. (While the map had region names their dark halos lay on these cells
    // of the map and not of Home, which read as 0.989; the bound was 0.9 then.)
    // Two-sided: above the veil's 0.90 by as much would mean the veil had gone or thinned.
    expect(mean(onHome) / mean(onMap), `${size.width} x ${size.height}`).toBeGreaterThanOrEqual(0.87);
    expect(mean(onHome) / mean(onMap), `${size.width} x ${size.height}`).toBeLessThanOrEqual(0.93);
    // Without the veil the same cells are the gas itself, which must be at the map's strength. This pins the gas
    // apart from the veil: a gas dimmed by a tenth under a missing veil would pass the bounds above.
    // Measured 0.997, 0.998 and 0.989 at the three sizes (the fainter stars of Home still reach a little into
    // the lower quartile, hence not quite 1).
    await page.addStyleTag({ content: '.map-pane .veil { visibility: hidden !important; }' });
    await expect(page.locator('.map-pane .veil')).toBeHidden();
    const bare = await cells();
    console.log(`nebula on Home without the veil at ${size.width} x ${size.height}: ${mean(bare).toFixed(1)} / ${mean(onMap).toFixed(1)} = ${(mean(bare) / mean(onMap)).toFixed(3)}`);
    expect(mean(bare) / mean(onMap), `${size.width} x ${size.height}, veil hidden`).toBeGreaterThanOrEqual(0.97);
  }
});
