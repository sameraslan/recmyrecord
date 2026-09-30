import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { camera, coversSettled, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap } from './helpers';

test('the map is a lazily loaded WebGL canvas that renders on demand', async ({ page }, info) => {
  const atlasRequests: string[] = [];
  page.on('request', (r) => {
    if (/\/data\/atlas-\d\.webp$/.test(r.url())) atlasRequests.push(r.url());
  });
  await page.goto('/map');
  await expect(page).toHaveTitle(`${COPY.titles.map} · recmyrecord`);
  await waitForMap(page);
  const canvas = page.locator('canvas.map-canvas');
  await expect(canvas).toHaveAttribute('aria-label', COPY.map.canvasLabel);
  await expect(canvas).toHaveAttribute('tabindex', '0');
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('ok');
  await waitForCameraIdle(page);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1).toBeLessThanOrEqual(1);
  expect(atlasRequests).toEqual([]);
  await shot(page, info, 'explore');
  await canvas.focus();
  // Zoom in step by step: atlases load only once covers are about to show, then two more steps fade them in.
  for (let i = 0; i < 14 && atlasRequests.length === 0; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect.poll(() => atlasRequests.length).toBeGreaterThan(0);
  for (let i = 0; i < 2; i++) await page.keyboard.press('+');
  await waitForCameraIdle(page);
  await page.waitForTimeout(800);
  await shot(page, info, 'explore-zoomed');
});

test('keyboard pans and zooms, 0 resets', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.locator('canvas.map-canvas').focus();
  await page.keyboard.press('ArrowRight');
  expect((await camera(page)).x).toBeGreaterThan(start.x);
  await page.keyboard.press('ArrowUp');
  expect((await camera(page)).y).toBeGreaterThan(start.y);
  await page.keyboard.press('+');
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeCloseTo(start.zoom, 3);
});

test('zoom buttons work', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeCloseTo(start.zoom, 3);
});

test.describe('desktop pointer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('hover shows a label, drag pans, wheel zooms, click selects and flies', async ({ page }, info) => {
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const p = await visibleAlbumPoint(page);
    await page.mouse.move(p.x, p.y);
    const tip = page.locator('.map-tip');
    await expect(tip).toHaveCSS('opacity', '1');
    await expect(tip.locator('.t')).not.toBeEmpty();
    await coversSettled(page, '.map-tip');
    await shot(page, info, 'explore-hover');
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    const before = await camera(page);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 + 80, vp.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await waitForCameraIdle(page);
    expect((await camera(page)).x).toBeLessThan(before.x);
    const z0 = (await camera(page)).zoom;
    await page.mouse.wheel(0, -300);
    await waitForCameraIdle(page);
    expect((await camera(page)).zoom).toBeGreaterThan(z0);
    await page.keyboard.press('0');
    await waitForCameraIdle(page);
    const q = await visibleAlbumPoint(page);
    const z1 = (await camera(page)).zoom;
    await page.mouse.click(q.x, q.y);
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
    await waitForCameraIdle(page);
    expect((await camera(page)).zoom).toBeGreaterThan(z1);
    await expect(page.locator('.map-sel')).toHaveCSS('opacity', '1');
  });
});

test.describe('phone touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('tap selects an album', async ({ page }, info) => {
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const p = await visibleAlbumPoint(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
    await waitForCameraIdle(page);
    await shot(page, info, 'explore-tap');
  });
});

test('Home shows the map dimmed and not interactive', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('tabindex', '-1');
  // A backdrop that takes no input must not announce drag and key controls.
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('aria-label', COPY.map.canvasLabelStatic);
  await expect(page.getByRole('img', { name: COPY.map.canvasLabel })).toHaveCount(0);
  // R3F puts an inline pointer-events style on its wrapper; the canvas itself must inherit `none` here.
  expect(await page.locator('canvas.map-canvas').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(page.getByRole('button', { name: COPY.map.zoomIn })).toHaveCount(0);
  // The same canvas becomes the interactive map on /map.
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('aria-label', COPY.map.canvasLabel);
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('tabindex', '0');
});
