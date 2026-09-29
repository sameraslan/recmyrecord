import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { isPhone, shot } from './helpers';

test.describe('desktop header search', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('builds the index lazily, suggests, highlights and navigates with the keyboard', async ({ page }, info) => {
    const thumbRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/data/thumbs.webp')) thumbRequests.push(r.url());
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
});
