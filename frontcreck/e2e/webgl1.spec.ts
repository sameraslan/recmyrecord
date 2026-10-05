import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';

// A browser with WebGL1 but no WebGL2. three.js (0.163 and later) only asks for a webgl2 context, so the map
// has to treat such a browser as having no WebGL rather than mount a renderer that throws.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof getContext;
  });
});

test('with WebGL1 only the map shows the no-WebGL message and search still works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/map');
  await expect(page.getByText(COPY.map.noWebgl)).toBeVisible();
  await expect(page.getByText(COPY.map.noWebglHint)).toBeVisible();
  await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('unavailable');
  const input = page.getByRole('combobox', { name: COPY.search.label });
  await input.click();
  await input.pressSequentially('loveless');
  await expect(page.getByRole('option').first()).toContainText('Loveless');
  expect(errors).toEqual([]);
});
