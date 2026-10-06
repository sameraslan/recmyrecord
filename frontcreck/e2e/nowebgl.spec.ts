import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { contrastOverBackdrop, waitForAnimations } from './helpers';

test('without WebGL the map shows a message, asks for no theme file, and search still works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const themeRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/theme/')) themeRequests.push(r.url());
  });
  await page.goto('/map');
  await expect(page.getByText(COPY.map.noWebgl)).toBeVisible();
  await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
  // No map, so no map data and no zoom corner; the names toggle (which only the map's chunk makes) is not left
  // behind on its own either.
  await expect(page.locator('.map-names')).toHaveCount(0);
  await expect(page.locator('.map-zoom')).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.map.names, exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('unavailable');
  const input = page.getByRole('combobox', { name: COPY.search.label });
  await input.click();
  await input.pressSequentially('loveless');
  await expect(page.getByRole('option').first()).toContainText('Loveless');
  expect(themeRequests).toEqual([]);
  expect(errors).toEqual([]);
});

// Once Task 8 exists this test also covers the album list without WebGL (it 404s before that task, so it is skipped until then).
test('without WebGL the album list, the similarity slider and links still work', async ({ page }) => {
  const res = await page.goto('/album/in-rainbows-radiohead');
  test.skip(res?.status() === 404, 'album pages arrive in Task 8');
  await expect(page.locator('li.rec')).toHaveCount(5);
  // The slider (Task 7) is rendered without the map, so the list still switches stops.
  await page.getByRole('button', { name: COPY.slider.stops.mood, exact: true }).click();
  await expect(page.locator('li.rec').first()).toContainText('Tindersticks');
  await page.locator('li.rec').first().locator('a.rec-main').click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('In Rainbows');
});

test('without WebGL the see-through panels sit on the plain sky and keep 4.5:1', async ({ page }) => {
  await page.goto('/album/making-movies-dire-straits');
  await expect(page.locator('li.rec')).toHaveCount(5);
  await expect(page.getByText(COPY.map.noWebgl)).toBeVisible();
  await waitForAnimations(page);
  // No gas behind the glass: the pane is the plain sky colour, which the glass panels must not turn muddy or pale.
  expect(await page.locator('.map-pane').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(7, 6, 10)');
  const results = [
    ...(await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.tags li', '.rec-n', '.rec-artist', '.rec-shared'])),
    ...(await contrastOverBackdrop(page, '.map-pane', ['.map-msg', '.mode .cap', '.mode-stops button', '.mode-note'])),
  ];
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});
