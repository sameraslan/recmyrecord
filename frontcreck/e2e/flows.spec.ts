import { expect, test as base, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, tabTo, visibleAlbumPoint, waitForCameraIdle, waitForMap } from './helpers';

/** Every flow fails on a page error or a console error (remote cover failures excepted: covers fall back). */
const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        // Chrome's text for a failed resource never contains its URL; the URL is in the message location.
        const remoteCover = m.text().startsWith('Failed to load resource') && /^https:\/\/i\.scdn\.co\//.test(m.location().url);
        if (!remoteCover) errors.push(m.text());
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const IR = '/album/in-rainbows-radiohead';
const titles = (page: Page) => page.locator('ol.rec-list .rec-title').allTextContents();

async function searchFromHome(page: Page, isMobile: boolean, q: string, expectTitle: string) {
  await page.goto('/');
  const input = page.locator('.hero').getByRole('combobox');
  await act(input, isMobile);
  await input.pressSequentially(q);
  const option = page.getByRole('option').first();
  await expect(option).toContainText(expectTitle);
  await act(option, isMobile);
}

test('search to album', async ({ page, isMobile }) => {
  await searchFromHome(page, isMobile, 'kid a', 'Kid A');
  await expect(page).toHaveURL('/album/kid-a-radiohead');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kid A');
  await expect(page.locator('li.rec')).toHaveCount(5);
});

test('going deeper and breadcrumb back', async ({ page, isMobile }) => {
  await page.goto(IR);
  const first = (await titles(page))[0];
  await act(page.locator('li.rec').first().locator('a.rec-main'), isMobile);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(first);
  const trail = page.getByRole('navigation', { name: COPY.album.trailNav });
  await act(trail.getByRole('link', { name: 'In Rainbows' }), isMobile);
  await expect(page).toHaveURL(IR);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('In Rainbows');
});

test('slider change', async ({ page, isMobile }) => {
  await page.goto(IR);
  await waitForMap(page);
  if (isMobile) await act(page.getByRole('button', { name: COPY.phone.mapLabel }), true);
  await act(page.getByRole('button', { name: COPY.slider.stops.mood, exact: true }), isMobile);
  await expect(page).toHaveURL(`${IR}?by=mood`);
  if (isMobile) await act(page.getByRole('button', { name: COPY.phone.listLabel }), true);
  await expect.poll(() => titles(page)).toEqual(['Tindersticks', 'Avalon', 'So', 'You Will Never Know Why', 'Imperial Bedroom']);
});

test('show more', async ({ page, isMobile }) => {
  await page.goto(IR);
  await act(page.getByRole('button', { name: COPY.album.showMore }), isMobile);
  await expect(page.locator('li.rec')).toHaveCount(10);
});

test('map click to album', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const p = await visibleAlbumPoint(page);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  const card = page.locator('.card');
  await expect(card).toBeVisible();
  const title = await card.locator('.t').textContent();
  await act(card.getByRole('link', { name: COPY.map.cardPrimary }), isMobile);
  await expect(page).toHaveURL(/\/album\//);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title!);
});

test('Home shelf', async ({ page, isMobile }) => {
  await page.goto('/');
  await act(page.getByRole('list', { name: COPY.home.shelfListLabel }).getByRole('link').nth(2), isMobile);
  await expect(page).toHaveURL('/album/to-pimp-a-butterfly-kendrick-lamar');
});

test('Surprise me', async ({ page, isMobile }) => {
  await page.goto('/');
  await act(page.getByRole('button', { name: COPY.home.surprise }), isMobile);
  await expect(page).toHaveURL(/\/album\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).not.toBeEmpty();
});

test('old URL redirects', async ({ page }) => {
  for (const url of ['/recommend/album', '/recommend/album/', '/insights', '/insights/']) {
    await page.goto(url);
    await expect(page, url).toHaveURL('/');
  }
});

test('404', async ({ page, isMobile, errors }) => {
  const res = await page.goto('/nothing-here');
  // The document's own 404 status is logged as a failed resource load: that one is expected here.
  const own = errors.findIndex((e) => e.startsWith('Failed to load resource') && e.includes('404'));
  if (own >= 0) errors.splice(own, 1);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: COPY.notFound.heading })).toBeVisible();
  await expect(page.getByText(COPY.notFound.sub)).toBeVisible();
  await act(page.getByRole('link', { name: COPY.notFound.mapLink }), isMobile);
  await expect(page).toHaveURL('/map');
});

test('keyboard-only search, deeper and back to the map', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow is desktop');
  await page.goto('/map');
  await page.keyboard.press('/');
  await page.keyboard.type('loveless');
  await expect(page.getByRole('option').first()).toContainText('Loveless');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/album/loveless-my-bloody-valentine');
  await expect(page.locator('#seed-title')).toBeFocused();
  await tabTo(page, (el) => el.classList.contains('rec-main'));
  const target = await page.evaluate(() => (document.activeElement as HTMLAnchorElement).getAttribute('href'));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(target!);
  await tabTo(page, (el) => el instanceof HTMLInputElement && el.type === 'range');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\?by=mood$/);
  await page.locator('#seed-title').focus();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/map');
});

test('covers fall back to the thumbnail sprite, then to the lettered tile', async ({ page, isMobile }) => {
  await page.route('https://i.scdn.co/**', (route) => route.abort());
  await page.goto(IR);
  await expect(page.locator('.seed .cover')).toHaveAttribute('data-state', 'sprite');
  await expect(page.locator('li.rec .cover').first()).toHaveAttribute('data-state', 'sprite');
  // "Spiritual Unity" is the one album without a cover id: its tile shows at once, with no request at all.
  const input = page.locator('.top-search').getByRole('combobox');
  if (isMobile) {
    await page.getByRole('button', { name: COPY.search.open, exact: true }).tap();
    await page.getByRole('dialog').getByRole('combobox').pressSequentially('spiritual unity');
  } else {
    await input.click();
    await input.pressSequentially('spiritual unity');
  }
  const option = page.getByRole('option').filter({ hasText: 'Spiritual Unity' }).first();
  await expect(option.locator('.cover')).toHaveAttribute('data-state', 'tile');
});

test('works with web storage blocked', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    for (const name of ['sessionStorage', 'localStorage'] as const) {
      Object.defineProperty(window, name, { get() { throw new DOMException('blocked', 'SecurityError'); } });
    }
  });
  await searchFromHome(page, isMobile, 'in rainbows', 'In Rainbows');
  // The block really holds: both accessors throw in the page.
  expect(
    await page.evaluate(() =>
      (['sessionStorage', 'localStorage'] as const).map((n) => {
        try {
          void window[n];
          return `${n} readable`;
        } catch (e) {
          return (e as DOMException).name;
        }
      }),
    ),
  ).toEqual(['SecurityError', 'SecurityError']);
  await expect(page).toHaveURL(IR);
  await act(page.locator('li.rec').first().locator('a.rec-main'), isMobile);
  await expect(page.getByRole('navigation', { name: COPY.album.trailNav }).getByRole('link', { name: 'In Rainbows' })).toBeVisible();
});

test('the core flow works inside a sandboxed iframe', async ({ page, baseURL, isMobile }) => {
  test.skip(isMobile, 'one run is enough');
  await page.setContent(
    `<iframe sandbox="allow-scripts allow-same-origin allow-popups" src="${baseURL}/" style="border:0;width:1400px;height:860px"></iframe>`,
  );
  const frame = page.frameLocator('iframe');
  const input = frame.locator('.hero').getByRole('combobox');
  await input.click();
  await input.pressSequentially('kid a');
  await frame.getByRole('option').first().click();
  await expect(frame.getByRole('heading', { level: 1 })).toHaveText('Kid A');
  await frame.locator('li.rec').first().locator('a.rec-main').click();
  await expect(frame.getByRole('heading', { level: 1 })).not.toHaveText('Kid A');
});
