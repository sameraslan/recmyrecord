import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';

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
