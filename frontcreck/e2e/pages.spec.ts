import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { shot, waitForAnimations, waitForMap, waitForMapQuiet } from './helpers';

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
    await expect(page.getByText(COPY.home.wander)).toBeVisible();
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
  for (const p of COPY.about.body) await expect(page.getByText(p)).toBeVisible();
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
  await expect(page.getByText(COPY.notFound.body)).toBeVisible();
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
