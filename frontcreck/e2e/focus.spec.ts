import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { shot, waitForCameraIdle, waitForMap } from './helpers';

async function recsOf(page: Page, id: number, stop: 'sonic' | 'balanced' | 'mood', n = 5): Promise<number[]> {
  return page.evaluate(
    async ([i, s, k]) => {
      const recs = await (await fetch('/data/recs.json')).json();
      return recs[s][i].slice(0, k);
    },
    [id, stop, n] as const,
  );
}

async function setFocus(page: Page, seed: number, recs: number[]) {
  await page.evaluate(([s, r]) => window.__rmr!.getState().setFocus({ seed: s, recs: r }), [seed, recs] as const);
}

test('focus draws numbered covers joined to the seed, framed on screen', async ({ page }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  const recs = await recsOf(page, 11, 'balanced');
  await setFocus(page, 11, recs);
  await waitForCameraIdle(page);
  const markers = page.locator('.mk');
  await expect(markers).toHaveCount(6);
  await expect(page.locator('.mk--seed')).toHaveAttribute('data-album-id', '11');
  await expect(page.locator('.mk-n')).toHaveText(['1', '2', '3', '4', '5']);
  await expect(page.locator('svg.mk-lines line[data-to]')).toHaveCount(5);
  const vp = page.viewportSize()!;
  for (const box of await markers.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(vp.width);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(vp.height);
  }
  await shot(page, info, 'focus');
});

test('hot album is highlighted and a hovered marker shows its label', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer hover');
  await page.goto('/map');
  await waitForMap(page);
  const recs = await recsOf(page, 11, 'balanced');
  await setFocus(page, 11, recs);
  await waitForCameraIdle(page);
  await page.evaluate((id) => window.__rmr!.getState().setHot(id), recs[1]);
  await expect(page.locator(`.mk[data-album-id="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`svg.mk-lines line[data-to="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await page.evaluate(() => window.__rmr!.getState().setHot(null));
  await page.locator(`.mk[data-album-id="${recs[2]}"]`).hover();
  await expect(page.locator('.map-tip')).toHaveCSS('opacity', '1');
});

test('the slider morphs the layout and changes the stop', async ({ page }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const slider = page.getByRole('slider', { name: COPY.slider.label });
  await expect(slider).toHaveAttribute('aria-valuetext', 'Balanced');
  await expect(page.getByText(COPY.slider.notes.balanced)).toBeVisible();
  const before = await page.evaluate(() => window.__rmr!.map!.screenPoint(11));
  await page.getByRole('button', { name: COPY.slider.stops.mood, exact: true }).click();
  expect(await page.evaluate(() => window.__rmr!.getState().stop)).toBe('mood');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Mood');
  await expect(page.getByText(COPY.slider.notes.mood)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  const after = await page.evaluate(() => window.__rmr!.map!.screenPoint(11));
  expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(1);
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.__rmr!.getState().stop)).toBe('sonic');
  await shot(page, info, 'slider-sonic');
});

test('the morph is animated, and instant under reduced motion', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await page.waitForTimeout(120);
  expect(await page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  const before = await page.evaluate(() => window.__rmr!.map!.screenPoint(11));
  await page.evaluate(() => window.__rmr!.getState().setStop('sonic'));
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  // The morph really happened, at once: album 11 already sits at its sonic position.
  const after = await page.evaluate(() => window.__rmr!.map!.screenPoint(11));
  expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(1);
});
