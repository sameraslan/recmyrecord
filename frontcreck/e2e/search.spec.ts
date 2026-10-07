import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { tileLetter } from '../src/lib/data/catalog';
import { COVER_URL_RE, THUMB_SHEET_RE, albumWithoutCover } from './data';
import { answerArchiveCovers, coversSettled, isPhone, shot } from './helpers';

// An album chosen from the data can have a Cover Art Archive cover, whose hosts are sometimes very slow.
test.beforeEach(async ({ page }) => {
  await answerArchiveCovers(page);
});

const BODY_SPOT = { x: 700, y: 600 };

/** Requests that navigate to an album page (a document load or an RSC navigation, not a prefetch). */
function albumNavigations(page: Page): string[] {
  const found: string[] = [];
  page.on('request', (r) => {
    if (!new URL(r.url()).pathname.startsWith('/album/')) return;
    const h = r.headers();
    if (h['next-router-prefetch'] || h['next-router-segment-prefetch']) return;
    found.push(r.url());
  });
  return found;
}

/** A "nothing happens" wait, not a settle: it gives a navigation that must not happen every chance to start.
 * router.push issues its request within milliseconds, so a fixed pause is enough (there is no condition to
 * wait for when nothing is expected, and network idle can wait on unrelated cover requests). */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(750);
}

test.describe('desktop header search', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('builds the index lazily, suggests, highlights and navigates with the keyboard', async ({ page }, info) => {
    const thumbRequests: string[] = [];
    page.on('request', (r) => {
      if (THUMB_SHEET_RE.test(r.url())) thumbRequests.push(r.url());
    });
    await page.goto('/nope');
    await page.waitForLoadState('networkidle');
    expect(thumbRequests, 'the thumbnail sprite is a lazy fallback, never part of a page load').toEqual([]);
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await expect(page.locator('html')).not.toHaveAttribute('data-search-index', 'ready');
    await input.focus();
    await expect(page.locator('html')).toHaveAttribute('data-search-index', 'ready');
    await input.pressSequentially('loveless', { delay: 20 });
    const options = page.getByRole('option');
    await expect(options.first()).toContainText('Loveless');
    expect(await options.count()).toBeLessThanOrEqual(6);
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(input).toHaveAttribute('aria-activedescendant', /.+/);
    await expect(options.first().locator('mark')).toHaveText('Loveless');
    await expect(options.first().locator('.cover')).toBeVisible();
    await coversSettled(page, '.combo-pop');
    await shot(page, info, 'search-open');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/album\/loveless-my-bloody-valentine$/);
  });

  test('arrow keys move the active option and Escape closes then clears', async ({ page }) => {
    await page.goto('/nope');
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('radiohead');
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await input.press('ArrowDown');
    await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
    await input.press('ArrowUp');
    await input.press('ArrowUp');
    await expect(page.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
    await input.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(input).toHaveValue('radiohead');
    await input.press('Escape');
    await expect(input).toHaveValue('');
  });

  test('shows the no-match message', async ({ page }, info) => {
    await page.goto('/nope');
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('zzkq');
    await expect(page.getByText(COPY.search.noMatches('zzkq'))).toBeVisible();
    await expect(page.locator('.combo-empty b')).toHaveText('zzkq');
    await shot(page, info, 'search-none');
  });

  test('a press on the message or a right-click on an option does not keep the popover open', async ({ page }) => {
    await page.goto('/nope');
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('zzkq');
    const pop = page.locator('.top-search .combo-pop');
    await page.locator('.combo-empty').click();
    await expect(pop).toBeVisible();
    await page.mouse.click(BODY_SPOT.x, BODY_SPOT.y);
    await expect(pop).toBeHidden();

    await input.fill('');
    await input.pressSequentially('radiohead');
    const navigations = albumNavigations(page);
    await page.getByRole('option').first().click({ button: 'right' });
    await settle(page);
    await expect(page).toHaveURL(/\/nope$/);
    expect(navigations).toEqual([]);
    await page.mouse.click(BODY_SPOT.x, BODY_SPOT.y);
    await expect(page.getByRole('listbox')).toBeHidden();
  });

  test('a Ctrl+click on an option on macOS opens no album', async ({ page }) => {
    await page.goto('/nope');
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('radiohead');
    const isMac = await page.evaluate(() => /Mac/i.test(navigator.platform));
    const navigations = albumNavigations(page);
    await page.getByRole('option').nth(1).click({ modifiers: ['Control'] });
    if (isMac) {
      await settle(page);
      await expect(page).toHaveURL(/\/nope$/);
      expect(navigations).toEqual([]);
    } else {
      await expect(page).toHaveURL(/\/album\/kid-a-radiohead$/);
    }
  });

  test('Tab and a click elsewhere close the list', async ({ page }) => {
    await page.goto('/nope');
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('radiohead');
    await expect(page.getByRole('listbox')).toBeVisible();
    await input.press('Tab');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await input.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.mouse.click(BODY_SPOT.x, BODY_SPOT.y);
    await expect(page.getByRole('listbox')).toBeHidden();
  });

  test('the focused field shows a lamp border with a softer halo, without moving', async ({ page }) => {
    await page.goto('/nope');
    const field = page.locator('.top-search .combo-field');
    const before = await field.boundingBox();
    await field.locator('input').focus();
    // Retrying assertions: the border colour eases in over 0.2 s.
    await expect(field).toHaveCSS('border-top-color', 'rgb(230, 168, 86)');
    await expect(field).toHaveCSS('border-top-width', '1px');
    await expect(field).toHaveCSS('box-shadow', /^(color\(srgb 0\.90\d* 0\.65\d* 0\.33\d* \/ 0\.45\)|rgba\(230, 168, 86, 0\.45\)) 0px 0px 0px 1px$/);
    expect(await field.boundingBox()).toEqual(before);
  });

  test('in forced-colors mode the focused field gets a system outline', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/nope');
    const field = page.locator('.top-search .combo-field');
    await field.locator('input').focus();
    await expect(field).toHaveCSS('outline-style', 'solid');
    await expect(field).toHaveCSS('outline-width', '2px');
  });

  test('when the albums fail to load, Tab reaches Retry and Retry returns focus to the field', async ({ page }) => {
    await page.route('**/data/albums.json', (route) => route.abort());
    await page.goto('/nope');
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially('kid a');
    const alert = page.locator('.top-search').getByRole('alert');
    await expect(alert).toContainText(COPY.error.body);
    await input.press('Tab');
    const retry = alert.getByRole('button', { name: COPY.error.retry });
    await expect(retry).toBeFocused();
    await page.unroute('**/data/albums.json');
    await page.keyboard.press('Enter');
    await expect(input).toBeFocused();
    await expect(page.getByRole('option').first()).toContainText('Kid A');
  });

  test('slash is ignored while typing in a field and with modifier keys', async ({ page }) => {
    await page.goto('/nope');
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await page.keyboard.type('a/b');
    await expect(input).toHaveValue('a/b');
    await input.fill('');
    await page.locator('header.top').click({ position: { x: 300, y: 5 } });
    await expect(input).not.toBeFocused();
    for (const combo of ['Control+/', 'Meta+/', 'Alt+/']) {
      await page.keyboard.press(combo);
      await expect(input, combo).not.toBeFocused();
    }
    await page.keyboard.press('/');
    await expect(input).toBeFocused();
  });

  test('slash focuses search from anywhere and a click chooses', async ({ page }) => {
    await page.goto('/nope');
    await page.locator('header.top').click({ position: { x: 300, y: 5 } });
    await page.keyboard.press('/');
    // From Task 10 on, the 404 page has its own search field, registered last, so `/` may focus that one.
    await expect(page.locator(':focus')).toHaveAttribute('role', 'combobox');
    await page.keyboard.type('bjork');
    await expect(page.getByRole('option').first()).toContainText('Björk');
    await page.getByRole('option').first().click();
    await expect(page).toHaveURL(/\/album\/.+-bjork$/);
  });
});

test.describe('covers', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  async function searchFor(page: import('@playwright/test').Page, q: string) {
    const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
    await input.click();
    await input.pressSequentially(q);
    await expect(page.getByRole('option').first()).toBeVisible();
  }

  test('while the remote image loads the box is empty, with no letter', async ({ page }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((r) => (release = r));
    await page.route(COVER_URL_RE, async (route) => {
      await held;
      await route.continue().catch(() => {});
    });
    await page.goto('/nope');
    await searchFor(page, 'kid a');
    const cover = page.getByRole('option').first().locator('.cover');
    await expect(cover).toHaveAttribute('data-state', 'remote');
    await expect(cover.locator('.fb')).toHaveCount(0);
    await expect(cover).toHaveCSS('background-color', 'rgb(38, 32, 25)');
    release();
    await expect(cover.locator('img.ok')).toBeVisible();
  });

  test('falls back to the sprite, then to the lettered tile', async ({ page }) => {
    await page.route(COVER_URL_RE, (route) => route.abort());
    await page.goto('/nope');
    await searchFor(page, 'kid a');
    const cover = page.getByRole('option').first().locator('.cover');
    await expect(cover).toHaveAttribute('data-state', 'sprite');
    await expect(cover.locator('.spr')).toBeVisible();
    await expect(cover.locator('.fb')).toHaveCount(0);

    const next = await page.context().newPage();
    await next.route(COVER_URL_RE, (route) => route.abort());
    await next.route(THUMB_SHEET_RE, (route) => route.abort());
    await next.goto('/nope');
    await searchFor(next, 'kid a');
    const tile = next.getByRole('option').first().locator('.cover');
    await expect(tile).toHaveAttribute('data-state', 'tile');
    await expect(tile.locator('.fb')).toHaveText('K');
    await expect(tile.locator('.spr')).toHaveCount(0);
    await next.close();
  });

  test('an album without a cover shows its tile and requests nothing', async ({ page }) => {
    const requests: string[] = [];
    // Only requests this album could cause: the sprite sheet, or a cover URL with no cover id (at most the size prefix). Typing key
    // by key lists (and loads covers for) other albums matching each prefix, which is fine.
    page.on('request', (r) => {
      if (/^https:\/\/i\.scdn\.co\/image\/(ab67616d[0-9a-f]{8})?$/.test(r.url()) || THUMB_SHEET_RE.test(r.url())) requests.push(r.url());
    });
    // An album without a cover id, found in the data (the pipeline keeps adding covers, so none is named here).
    const bare = albumWithoutCover();
    test.skip(!bare, 'every album in public/data has a cover id');
    await page.goto('/nope');
    await searchFor(page, bare!.query);
    const cover = page.locator(`[role="option"][data-album="${bare!.slug}"] .cover`);
    await expect(cover).toHaveAttribute('data-state', 'tile');
    await expect(cover.locator('.fb')).toHaveText(tileLetter(bare!.title));
    await expect(cover.locator('img, .spr')).toHaveCount(0);
    await page.waitForTimeout(300); // nothing should happen: no cover request for a tile
    expect(requests).toEqual([]);
  });
});

test.describe('phone search sheet', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('the header icon opens a full-screen sheet; choosing navigates; close returns focus', async ({ page }, info) => {
    expect(isPhone(info)).toBe(true);
    await page.goto('/nope');
    await expect(page.locator('.top-search')).toBeHidden();
    const toggle = page.getByRole('button', { name: COPY.search.open });
    await toggle.tap();
    const sheet = page.getByRole('dialog', { name: COPY.search.sheetLabel });
    await expect(sheet).toBeVisible();
    const input = sheet.getByRole('combobox');
    await expect(input).toBeFocused();
    await input.pressSequentially('kid a');
    await expect(sheet.getByRole('option').first()).toContainText('Kid A');
    await coversSettled(page, '.search-sheet');
    await shot(page, info, 'search-sheet');
    const box = await sheet.getByRole('option').first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await sheet.getByRole('button', { name: COPY.search.close }).tap();
    await expect(sheet).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.tap();
    await page.getByRole('dialog').getByRole('combobox').pressSequentially('kid a');
    await page.getByRole('dialog').getByRole('option').first().tap();
    await expect(page).toHaveURL(/\/album\/kid-a-radiohead$/);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('the sheet makes the page behind inert, locks scrolling and restores only what it changed', async ({ page }) => {
    await page.goto('/nope');
    // Another owner has already made main inert: the sheet must leave that alone.
    await page.evaluate(() => {
      document.getElementById('main')!.inert = true;
    });
    const toggle = page.getByRole('button', { name: COPY.search.open });
    const tbox = await toggle.boundingBox();
    expect(tbox!.width).toBeGreaterThanOrEqual(44);
    expect(tbox!.height).toBeGreaterThanOrEqual(44);
    await toggle.tap();
    const sheet = page.getByRole('dialog', { name: COPY.search.sheetLabel });
    await expect(sheet).toBeVisible();
    const cbox = await sheet.getByRole('button', { name: COPY.search.close }).boundingBox();
    expect(cbox!.width).toBeGreaterThanOrEqual(44);
    expect(cbox!.height).toBeGreaterThanOrEqual(44);
    // Result rows span the sheet's full content width, under the close button too.
    await sheet.getByRole('combobox').pressSequentially('kid a');
    const row = await sheet.getByRole('option').first().boundingBox();
    const field = await sheet.locator('.combo-field').boundingBox();
    expect(row!.x).toBeCloseTo(field!.x, 0);
    expect(row!.x + row!.width).toBeGreaterThanOrEqual(cbox!.x + cbox!.width - 1);
    await sheet.getByRole('combobox').fill('');
    const open = await page.evaluate(() => ({
      skip: document.querySelector<HTMLElement>('a.skip')!.inert,
      header: document.querySelector<HTMLElement>('header.top')!.inert,
      main: document.getElementById('main')!.inert,
      overflow: document.body.style.overflow,
      overscroll: getComputedStyle(document.querySelector('.search-sheet')!).overscrollBehaviorY,
    }));
    expect(open).toEqual({ skip: true, header: true, main: true, overflow: 'hidden', overscroll: 'contain' });

    const input = sheet.getByRole('combobox');
    await input.pressSequentially('kid a');
    await expect(sheet.getByRole('option').first()).toBeVisible();
    // The on-screen keyboard's Done blurs the field; the results stay.
    await input.evaluate((el) => (el as HTMLInputElement).blur());
    await page.waitForTimeout(100); // nothing should happen: the blur must not close the results
    await expect(sheet.getByRole('option').first()).toBeVisible();

    await sheet.getByRole('button', { name: COPY.search.close }).tap();
    await expect(sheet).toBeHidden();
    await expect(toggle).toBeFocused();
    const closed = await page.evaluate(() => ({
      skip: document.querySelector<HTMLElement>('a.skip')!.inert,
      header: document.querySelector<HTMLElement>('header.top')!.inert,
      main: document.getElementById('main')!.inert,
      overflow: document.body.style.overflow,
    }));
    expect(closed).toEqual({ skip: false, header: false, main: true, overflow: '' });
  });

  test('the no-match message wraps a long unbroken query without horizontal overflow', async ({ page }, info) => {
    await page.goto('/nope');
    await page.getByRole('button', { name: COPY.search.open }).tap();
    const sheet = page.getByRole('dialog', { name: COPY.search.sheetLabel });
    await sheet.getByRole('combobox').pressSequentially('zzkq');
    await expect(sheet.locator('.combo-empty b')).toHaveText('zzkq');
    await shot(page, info, 'search-none');
    await sheet.getByRole('combobox').fill('q'.repeat(60));
    await expect(sheet.locator('.combo-empty b')).toHaveText('q'.repeat(60));
    const overflow = await page.evaluate(() => {
      const over = (el: Element) => el.scrollWidth - el.clientWidth;
      return {
        page: over(document.documentElement),
        sheet: over(document.querySelector('.search-sheet')!),
        message: over(document.querySelector('.search-sheet .combo-empty')!),
      };
    });
    expect(overflow).toEqual({ page: 0, sheet: 0, message: 0 });
  });
});
