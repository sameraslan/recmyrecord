import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { contrastRatio } from '../src/lib/contrast';
import { COPY } from '../src/lib/copy';
import { camera, tabTo, visibleAlbumPoint, waitForCameraIdle, waitForMap } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function audit(page: Page, label: string) {
  // Audit the settled state: mid-fade colours (a card sliding in, a panel cross-fading) are blends, not the design.
  // Bounded: a looping animation would otherwise hold the audit until the test times out.
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 2000 })
    .catch(async () => {
      const running = await page.evaluate(() =>
        document.getAnimations().filter((a) => a.playState === 'running').map((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target;
          return `${a.constructor.name} on ${t instanceof Element ? `${t.tagName.toLowerCase()}.${[...t.classList].join('.')}` : '?'}`;
        }),
      );
      throw new Error(`${label}: animations still running after 2 s, so the audit would see blended colours: ${running.join(', ')}`);
    });
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(
    r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`),
    label,
  ).toEqual([]);
}

const ROUTES: Array<[string, string]> = [
  ['/', 'recmyrecord'],
  ['/map', `${COPY.titles.map} · recmyrecord`],
  ['/album/in-rainbows-radiohead', 'In Rainbows by Radiohead · recmyrecord'],
  ['/about', `${COPY.titles.about} · recmyrecord`],
  ['/nothing-here', `${COPY.notFound.title} · recmyrecord`],
];

test('every route passes axe, has its own title, one h1 and landmarks', async ({ page }) => {
  for (const [url, title] of ROUTES) {
    await page.goto(url);
    await waitForMap(page); // every route draws the map (a dimmed backdrop outside /map and albums): the page has hydrated
    await expect(page, url).toHaveTitle(title);
    await expect(page.locator('h1'), url).toHaveCount(1);
    await expect(page.getByRole('banner'), url).toHaveCount(1);
    await expect(page.getByRole('main'), url).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: COPY.nav.label }), url).toBeVisible();
    await audit(page, url);
  }
});

test('open states pass axe', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  if (isMobile) {
    await page.getByRole('button', { name: COPY.search.open }).tap();
    await page.getByRole('dialog').getByRole('combobox').pressSequentially('radiohead');
  } else {
    await page.getByRole('combobox', { name: COPY.search.label }).click();
    await page.keyboard.type('radiohead');
  }
  await expect(page.getByRole('option').first()).toBeVisible();
  await audit(page, 'search results');
  // Escape closes the list, then clears the field, then (in the phone sheet) closes the sheet.
  for (let i = 0; i < 3 && (await page.getByRole('dialog').count()) + (await page.getByRole('option').count()) > 0; i++) {
    await page.keyboard.press('Escape');
  }
  const p = await visibleAlbumPoint(page);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect(page.locator('.card')).toBeVisible();
  await audit(page, 'map card');
  await page.goto('/album/in-rainbows-radiohead?by=mood');
  await page.getByRole('button', { name: COPY.album.showMore }).click();
  await audit(page, 'album, show more');
  if (isMobile) {
    await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
    await audit(page, 'phone map mode');
  }
});

test('the hot rank badge on the map passes axe', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a row turns its marker hot on hover or focus; the phone list and map are not shown together');
  // The accent with the lowest contrast against the badge's old dark text.
  await page.goto('/album/making-movies-dire-straits');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await page.locator('li.rec').first().locator('a.rec-main').hover();
  const badge = page.locator('.mk-n[data-hot]');
  await expect(badge).toBeVisible();
  await audit(page, 'album, hot rank badge');
  // axe leaves the badge "incomplete" (a transformed overlay over a canvas), so measure its own two colours too.
  const [fg, bg] = await badge.evaluate((el) => {
    const hex = (c: string) => `#${(c.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
    const cs = getComputedStyle(el);
    return [hex(cs.color), hex(cs.backgroundColor)];
  });
  expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
});

test('the data error state passes axe', async ({ page }) => {
  await page.route('**/data/albums.json', (route) => route.abort());
  await page.goto('/map');
  await expect(page.getByRole('alert').filter({ hasText: COPY.error.body })).toBeVisible();
  await audit(page, 'data error');
});

test('keyboard: the skip link comes first and targets main', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await page.goto('/nothing-here'); // no autofocused field on this page
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: COPY.skip, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('keyboard: every Home action in order, with visible focus', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await page.goto('/');
  await expect(page.locator('.hero').getByRole('combobox')).toBeFocused(); // the desktop autofocus is the start
  await page.keyboard.press('Tab');
  const explore = page.getByRole('link', { name: COPY.home.explore });
  await expect(explore).toBeFocused();
  expect(await explore.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: COPY.home.surprise })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('list', { name: COPY.home.shelfListLabel }).getByRole('link').first()).toBeFocused();
});

test('keyboard: the map, its controls and the album list are all reachable', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await tabTo(page, (el) => el.classList.contains('map-canvas'));
  const before = await camera(page);
  await page.keyboard.press('ArrowLeft');
  expect((await camera(page)).x).toBeLessThan(before.x);
  await tabTo(page, (el, label) => el.getAttribute('aria-label') === label, 40, COPY.map.zoomIn);
  const z0 = (await camera(page)).zoom;
  await page.keyboard.press('Enter');
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(z0);
  await page.goto('/album/in-rainbows-radiohead');
  await tabTo(page, (el) => el.classList.contains('show-more'));
  await page.keyboard.press('Enter');
  await expect(page.locator('li.rec')).toHaveCount(10);
  await tabTo(page, (el) => el.classList.contains('rec-sp'));
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('solid');
});
