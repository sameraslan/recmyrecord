import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { shot } from './helpers';

test('home renders the dark shell with header and hero', async ({ page }, info) => {
  await page.goto('/');
  await expect(page).toHaveTitle('recmyrecord');
  await expect(page.getByRole('link', { name: 'recmyrecord' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await expect(nav.getByRole('link', { name: COPY.nav.map })).toHaveAttribute('href', '/map');
  await expect(nav.getByRole('link', { name: COPY.nav.about })).toHaveAttribute('href', '/about');
  await expect(page.getByRole('heading', { level: 1, name: COPY.hero })).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(7, 6, 10)');
  const serif = await page.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(serif).toMatch(/Cormorant/i);
  await shot(page, info, 'shell-home');
});

test('skip link is the first focusable element and targets main', async ({ page }) => {
  await page.goto('/nope'); // no autofocused field on this page (Home autofocuses its search from Task 10)
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: COPY.skip });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});

test('old URLs redirect home', async ({ page }) => {
  for (const p of ['/recommend/album', '/recommend/album/', '/insights']) {
    await page.goto(p);
    expect(new URL(page.url()).pathname, p).toBe('/');
  }
});

test('removed API routes are gone and data files are served with caching', async ({ request }) => {
  expect((await request.get('/api/albums')).status()).toBe(404);
  expect((await request.get('/api/artists')).status()).toBe(404);
  const r = await request.get('/data/albums.json');
  expect(r.ok()).toBeTruthy();
  expect(r.headers()['cache-control']).toContain('max-age=86400');
  expect((await request.get('/map.jpg')).status()).toBe(404);
});

test('no horizontal scroll and no console errors on the shell', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
