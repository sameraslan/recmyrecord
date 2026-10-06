import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { camera, contrastOverBackdrop, mapFrames, panBrightestGasUnder, shot, waitForAnimations, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

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
      if (/\/data\/(thumbs|atlas-\d)\.webp$/.test(r.url())) heavy.push(r.url());
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
    // The first row of In Rainbows (balanced). Its page prefetch fails and the navigation request is slow; the
    // current panel and the map inset stay until the new album arrives (album pages have no loading boundary).
    const target = '/album/you-will-never-know-why-sweet-trip';
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
    await expect(page.locator('#seed-title')).toHaveText('You Will Never Know Why', { timeout: 10_000 });
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
 * ruled by the orchestrator). The tap target itself stays 44 px: phone.spec.ts and a11y.spec.ts test that.
 * Not measured for these two links: the backdrop above and below their line of words inside the tap target.
 */
const HERO_LINKS = ['.hero-row a.textbtn', '.hero-row button.textbtn'];
const boxOf = (selector: string): 'content' | 'text' => (HERO_LINKS.includes(selector) ? 'text' : 'content');

test('text over the nebula keeps 4.5:1 on Home, About and 404, and Home says nothing about regions', async ({ page }) => {
  // The full gas shader also on the software test browser: the lighter one is dimmer, and would flatter the text.
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  const PAGES: Array<[string, string, string[]]> = [
    ['/', '.home', ['.hero h1', '.hero .lede', ...HERO_LINKS, '.shelf-now .cap']],
    ['/about', '.about', ['.about h1', '.about p', '.about .about-h2', '.about .about-credits']],
    ['/nothing-here', '.notfound', ['.notfound h1', '.notfound-sub', '.notfound .textbtn']],
  ];
  for (const [url, scope, selectors] of PAGES) {
    await page.goto(url);
    await waitForMap(page);
    await waitForMapQuiet(page);
    await waitForAnimations(page);
    // Glints play on Home (part 2, as in the prototype); a bloom must not drift into the screenshot being measured.
    // TODO(part2-task8): twinkleOff(page)
    // One at a time, each scrolled into view first (the About card is taller than the screen; the map behind it does
    // not scroll): the helper refuses a rectangle that is cut by the edge of the screenshot.
    const ratios: Array<{ selector: string; ratio: number }> = [];
    for (const selector of selectors) {
      await page.locator(selector).first().scrollIntoViewIfNeeded();
      ratios.push(...(await contrastOverBackdrop(page, scope, [selector], { box: boxOf(selector) })));
    }
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

/** Moves the brightest gas on screen under each text in turn, at the page's own zoom and at three times it, and
 * measures the text there. The gas under the words after the pan must be at least gasFloor: a pan that the camera
 * clamp stopped short cannot pass on dark sky. */
async function brightestGasContrast(page: Page, url: string, scope: string, selectors: string[]): Promise<void> {
  await page.goto(url);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  // TODO(part2-task8): twinkleOff(page)
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
      const gas = await panBrightestGasUnder(page, selector, `${scope}, header.top`);
      const [{ ratio }] = await contrastOverBackdrop(page, scope, [selector], { box: boxOf(selector) });
      out.push(`${selector} ${ratio.toFixed(2)} (gas ${gas.toFixed(2)})`);
      expect(gas, `${url} x${zoom} ${selector}: bright gas is under the words`).toBeGreaterThanOrEqual(gasFloor(selector, zoom));
      expect(ratio, `${url} x${zoom} ${selector}`).toBeGreaterThanOrEqual(4.5);
    }
    console.log(`contrast with the brightest gas under the text ${url} x${zoom}: ${out.join(', ')}`);
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
  await brightestGasContrast(page, '/', '.home', ['.hero h1', '.hero .lede', ...HERO_LINKS, '.shelf-now .cap']);
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
  /** Mean luma (0 to 255) of the band. */
  const luma = async (): Promise<number> => {
    const png = (await page.screenshot({ clip: band })).toString('base64');
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
  };
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

test('Home shows the nebula nearly as bright as the map does: only the veil dims it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a phone the hero pad and the shelf leave too little bare nebula to compare');
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
    window.__rmrOpen = 'whole';
  });
  /** Mean luma (0 to 255) of each 40 px cell of the screen. */
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
          let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          out.push(sum / 1600);
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
  console.log(`nebula on Home against the map: ${mean(onHome).toFixed(1)} / ${mean(onMap).toFixed(1)} = ${(mean(onHome) / mean(onMap)).toFixed(3)}`);
  expect(mean(onMap), 'the compared cells are gas').toBeGreaterThan(40);
  // The approved picture (final-home.jpg) has the lower core at 0.89 of the map's: the veil's .1 and nothing else.
  expect(mean(onHome) / mean(onMap)).toBeGreaterThanOrEqual(0.8);
});
