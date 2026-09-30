import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { shot, visibleAlbumPoint, waitForCameraIdle, waitForMap } from './helpers';

const IR = '/album/in-rainbows-radiohead';
const titles = (page: Page) => page.locator('ol.rec-list .rec-title').allTextContents();

/** The accent colour of an album, read from the served data. */
async function accentOf(page: Page, slug: string): Promise<string> {
  return page.evaluate(async (s) => {
    const albums: { slug: string; w: string[] }[] = await (await fetch('/data/albums.json')).json();
    return albums.find((a) => a.slug === s)!.w[2];
  }, slug);
}

test('renders the seed, tags and the closest albums (balanced by default)', async ({ page }, info) => {
  const res = await page.goto(IR);
  expect(res?.status()).toBe(200);
  await expect(page).toHaveTitle('In Rainbows by Radiohead · recmyrecord');
  await expect(page.getByRole('heading', { level: 1, name: 'In Rainbows' })).toBeVisible();
  await expect(page.locator('.seed-artist')).toHaveText('Radiohead');
  await expect(page.locator('.tags li')).toHaveText(['lush', 'melancholic', 'bittersweet', 'mellow', 'atmospheric', 'warm']);
  await expect(page.getByRole('heading', { level: 2, name: COPY.album.listHeading })).toBeVisible();
  await expect(page.locator('li.rec')).toHaveCount(5);
  expect((await titles(page))[0]).toBe('undun');
  await expect(page.locator('li.rec').first().locator('.rec-shared')).toContainText('Shares ');
  await expect(page.getByRole('link', { name: new RegExp(`^${COPY.album.openInSpotify}`) })).toHaveAttribute('href', /^https:\/\/open\.spotify\.com\/album\//);
  await expect(page.locator('li.rec').first().locator('a.rec-sp')).toHaveAttribute('target', '_blank');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await shot(page, info, 'album');
});

test('the map beside an album shows the hint line on desktop, as in the mockup', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the hint is desktop only');
  await page.goto(IR);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect(page.locator('.map-hint')).toHaveText(COPY.map.hintAlbum);
  await expect(page.locator('.map-hint')).toBeVisible();
});

test('?by=mood shows the mood list, which matches the live site', async ({ page }) => {
  await page.goto(`${IR}?by=mood`);
  await expect.poll(() => titles(page)).toEqual(['Tindersticks', 'Avalon', 'So', 'You Will Never Know Why', 'Imperial Bedroom']);
  expect(await page.evaluate(() => window.__rmr!.getState().stop)).toBe('mood');
});

test('show more reveals rows 6 to 10 and show fewer hides them', async ({ page, isMobile }) => {
  await page.goto(IR);
  const more = page.getByRole('button', { name: COPY.album.showMore });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(page.locator('li.rec')).toHaveCount(10);
  await expect(page.getByRole('button', { name: COPY.album.showFewer })).toHaveAttribute('aria-expanded', 'true');
  if (!isMobile) {
    await waitForMap(page);
    await expect(page.locator('.mk')).toHaveCount(11);
  }
  await page.getByRole('button', { name: COPY.album.showFewer }).click();
  await expect(page.locator('li.rec')).toHaveCount(5);
});

test.describe('desktop split view', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('the slider swaps the list in place and writes ?by= without a navigation', async ({ page }, info) => {
    await page.goto(IR);
    await waitForMap(page);
    const historyBefore = await page.evaluate(() => history.length);
    await page.getByRole('button', { name: COPY.slider.stops.sonic, exact: true }).click();
    await expect(page).toHaveURL(`${IR}?by=sonic`);
    expect((await titles(page))[0]).toBe('Music for the Masses');
    expect(await page.evaluate(() => history.length)).toBe(historyBefore);
    await waitForCameraIdle(page);
    await shot(page, info, 'album-sonic');
    await page.getByRole('button', { name: COPY.slider.stops.balanced, exact: true }).click();
    await expect(page).toHaveURL(IR);
  });

  test('rows and map markers highlight each other and light shared tags', async ({ page }) => {
    await page.goto(IR);
    await waitForMap(page);
    await waitForCameraIdle(page);
    // Any row with a "Shares" line: its words are exactly the header tags that light up.
    const row = page.locator('li.rec').filter({ has: page.locator('.rec-shared') }).first();
    await expect(row).toHaveCount(1);
    const id = await row.getAttribute('data-album-id');
    const words = (await row.locator('.rec-shared').innerText()).replace(COPY.album.shares([]), '').split(', ');
    await row.locator('a.rec-main').hover();
    await expect(row).toHaveClass(/hot/);
    await expect(page.locator(`.mk[data-album-id="${id}"]`)).toHaveAttribute('data-hot', 'true');
    await expect(page.locator('.tags li.lit')).toHaveText(words);
    await page.mouse.move(5, 890);
    const other = page.locator('li.rec').nth(3);
    const otherId = await other.getAttribute('data-album-id');
    // Markers take no pointer events (the canvas hit-tests their boxes), so move the mouse to the cover's centre.
    const box = (await page.locator(`.mk[data-album-id="${otherId}"]`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(other).toHaveClass(/hot/);
    await expect(page.locator(`.mk[data-album-id="${otherId}"]`)).toHaveAttribute('data-hot', 'true');
  });

  test('the map stays right of the panel and a map click goes to that album', async ({ page }) => {
    await page.goto(IR);
    await waitForMap(page);
    await waitForCameraIdle(page);
    const panelRight = await page.locator('section.album').evaluate((el) => el.getBoundingClientRect().right);
    const lefts = await page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().left));
    expect(Math.min(...lefts)).toBeGreaterThanOrEqual(panelRight);
    await expect(page.locator('.mode')).toBeVisible();
    const modeLeft = await page.locator('.mode').evaluate((el) => el.getBoundingClientRect().left);
    expect(modeLeft).toBeGreaterThanOrEqual(panelRight);
    const focusIds = await page.evaluate(() => {
      const f = window.__rmr!.getState().focus!;
      return [f.seed, ...f.recs];
    });
    let target = await visibleAlbumPoint(page, 100, 900);
    while (focusIds.includes(target.id) || target.x < panelRight + 20) target = await visibleAlbumPoint(page, target.id + 1, 2000);
    await page.mouse.click(target.x, target.y);
    await expect(page).not.toHaveURL(IR);
    await expect(page).toHaveURL(/\/album\//);
  });

  test('copy link puts the album URL (with by) on the clipboard and says so', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${IR}?by=mood`);
    await page.getByRole('button', { name: COPY.album.copyLinkLabel }).click();
    await expect(page.getByRole('status').filter({ hasText: COPY.album.linkCopied })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/album\/in-rainbows-radiohead\?by=mood$/);
  });

  test('close and Escape return to the map and leave the store clean', async ({ page }) => {
    const albumState = () =>
      page.evaluate(() => {
        const s = window.__rmr!.getState();
        return { focus: s.focus, hot: s.hot, ambient: s.ambient, mapModeFor: s.mapModeFor, panelInset: s.panelInset, acc: document.documentElement.style.getPropertyValue('--acc') };
      });
    const clean = { focus: null, hot: null, ambient: null, mapModeFor: null, panelInset: 0, acc: '' };
    await page.goto(IR);
    await page.locator('li.rec').first().locator('a.rec-main').hover(); // make `hot` non-null first
    await page.getByRole('button', { name: COPY.album.close, exact: true }).click();
    await expect(page).toHaveURL('/map');
    await expect.poll(albumState).toEqual(clean);
    await page.goto(IR);
    await page.locator('#seed-title').focus();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL('/map');
    await expect.poll(albumState).toEqual(clean);
  });
});

test('going deeper keeps by, fills the trail, and the trail goes back', async ({ page }, info) => {
  await page.goto(`${IR}?by=mood`);
  await expect(page.locator('li.rec').first()).toContainText('Tindersticks');
  await page.locator('li.rec').first().locator('a.rec-main').click();
  await expect(page).toHaveURL(/\/album\/tindersticks-.+\?by=mood$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tindersticks');
  await expect(page.locator('#seed-title')).toBeFocused();
  const trail = page.getByRole('navigation', { name: COPY.album.trailNav });
  await expect(trail).toContainText(COPY.album.trailLabel);
  await expect(trail.getByRole('link', { name: 'In Rainbows' })).toBeVisible();
  await expect(trail.locator('[aria-current="page"]')).toHaveText('Tindersticks');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await shot(page, info, 'album-deeper');
  await trail.getByRole('link', { name: 'In Rainbows' }).click();
  await expect(page).toHaveURL(`${IR}?by=mood`);
  await expect(page.getByRole('navigation', { name: COPY.album.trailNav })).toHaveCount(0);
});

test('ambient colour and accent follow the album', async ({ page }) => {
  const acc = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--acc').trim());
  await page.goto(IR);
  await expect.poll(acc).toBe(await accentOf(page, 'in-rainbows-radiohead'));
  await expect(page.locator('.amb i.on')).toHaveCount(1);
  expect(await page.locator('.amb i.on').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('radial-gradient');
  const next = page.locator('li.rec').first().locator('a.rec-main');
  const nextSlug = (await next.getAttribute('href'))!.replace(/^\/album\//, '').replace(/\?.*$/, '');
  await next.click();
  await expect(page).toHaveURL(new RegExp(`/album/${nextSlug}`));
  await expect.poll(acc).toBe(await accentOf(page, nextSlug));
});

test('a direct ?by=mood load renders the mood list at once: no row animation, one focus', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __rowAnims: number; __focusSets: string[]; __rmr?: unknown };
    w.__rowAnims = 0;
    w.__focusSets = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      if (this.matches('li.rec')) w.__rowAnims++;
      return animate.apply(this, args);
    };
    // The store assigns window.__rmr when it loads: subscribe then, before any component renders.
    let hooks: { subscribe?: (fn: (s: { focus: { recs: number[] } | null }, p: { focus: unknown }) => void) => void } | undefined;
    let subscribed = false;
    Object.defineProperty(window, '__rmr', {
      configurable: true,
      get: () => hooks,
      set: (v) => {
        hooks = v;
        if (!subscribed && v?.subscribe) {
          subscribed = true;
          v.subscribe((s: { focus: { recs: number[] } | null }, p: { focus: unknown }) => {
            if (s.focus && s.focus !== p.focus) w.__focusSets.push(s.focus.recs.join());
          });
        }
      },
    });
  });
  await page.goto(`${IR}?by=mood`);
  await expect.poll(() => titles(page)).toEqual(['Tindersticks', 'Avalon', 'So', 'You Will Never Know Why', 'Imperial Bedroom']);
  await waitForMap(page);
  await waitForCameraIdle(page);
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __rowAnims: number; __focusSets: string[] };
    return { anims: w.__rowAnims, focusSets: w.__focusSets, running: [...document.querySelectorAll('li.rec')].some((r) => r.getAnimations().length > 0) };
  });
  expect(seen.running).toBe(false);
  expect(seen.anims, 'no row glides or fades in on the first client render').toBe(0);
  const moodIds = await page.locator('li.rec').evaluateAll((els) => els.map((e) => e.getAttribute('data-album-id')).join());
  expect(seen.focusSets, 'the map gets one focus (the mood list), so it frames once').toEqual([moodIds]);
});

test('a direct load leaves focus alone: the first Tab reaches the skip link', async ({ page }) => {
  await page.goto(IR);
  await expect(page.locator('li.rec')).toHaveCount(5);
  // The panel's effects have run once the accent is set.
  await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--acc'))).not.toBe('');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: COPY.skip })).toBeFocused();
});

test('Escape inside the search popover or the phone search sheet keeps the album open', async ({ page, isMobile }) => {
  if (isMobile) {
    await page.goto(IR);
    await page.getByRole('button', { name: COPY.search.open }).tap();
    const sheet = page.getByRole('dialog', { name: COPY.search.sheetLabel });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: COPY.search.close }).focus();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  } else {
    await page.route('**/data/albums.json', (route) => route.abort());
    await page.goto(IR);
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('kid a');
    const alert = page.locator('.top-search').getByRole('alert');
    await expect(alert).toContainText(COPY.error.body);
    const retry = alert.getByRole('button', { name: COPY.error.retry });
    await input.press('Tab');
    await expect(retry).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(input).toBeFocused();
  }
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(IR);
  await expect(page.locator('section.album')).toBeVisible();
});

test('an album with no Spotify release shows no Spotify links', async ({ page }) => {
  // The KLF's Chill Out has no Spotify release: no "Open in Spotify", never a search link.
  await page.goto('/album/chill-out-the-klf');
  await expect(page.getByRole('heading', { level: 1, name: 'Chill Out' })).toBeVisible();
  await expect(page.locator('.seed-actions a')).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.album.copyLinkLabel })).toBeVisible();
  await expect(page.locator('a[href*="open.spotify.com/search"]')).toHaveCount(0);
  // Inpariquipe's closest balanced album is Underworld's Dark & Long, which has no Spotify release either.
  await page.goto('/album/inpariquipe-kaatayra');
  const row = page.locator('li.rec').first();
  await expect(row.locator('.rec-title')).toHaveText('Dark & Long');
  await expect(row.locator('a.rec-main')).toBeVisible();
  await expect(row.locator('a.rec-sp')).toHaveCount(0);
  await expect(page.locator('li.rec').nth(1).locator('a.rec-sp')).toHaveAttribute('href', /^https:\/\/open\.spotify\.com\/album\//);
  await expect(page.locator('a[href*="open.spotify.com/search"]')).toHaveCount(0);
});

test('unknown album slugs are 404s', async ({ page }) => {
  const res = await page.goto('/album/not-an-album');
  expect(res?.status()).toBe(404);
});
