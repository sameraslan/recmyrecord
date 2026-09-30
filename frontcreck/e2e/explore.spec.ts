import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { camera, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap } from './helpers';

async function albumTitle(page: Page, id: number): Promise<string> {
  return page.evaluate(async (i) => (await (await fetch('/data/albums.json')).json())[i].t, id);
}

async function pick(page: Page, isMobile: boolean): Promise<number> {
  const p = await visibleAlbumPoint(page);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
  return (await page.evaluate(() => window.__rmr!.getState().selected))!;
}

/** Client coordinates on the canvas at least 40 px from every album. */
async function emptyMapPoint(page: Page): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(async () => {
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    const api = window.__rmr!.map!;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const q = api.screenPoint(i);
      if (q) pts.push(q);
    }
    for (let y = 140; y < innerHeight - 200; y += 17) {
      for (let x = 80; x < innerWidth - 80; x += 17) {
        const el = document.elementFromPoint(x, y);
        if (!el || !el.classList.contains('map-canvas')) continue;
        if (pts.every((q) => Math.hypot(q.x - x, q.y - y) > 40)) return { x, y };
      }
    }
    return null;
  });
  if (!p) throw new Error('no empty map point');
  return p;
}

test('a direct load of /map leaves focus alone, so the first Tab reaches the skip link', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await expect(page.locator('#map-h')).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: COPY.skip })).toBeFocused();
});

test('explore shows the hint, focuses its heading after in-app navigation, and a pick opens the card', async ({ page, isMobile }, info) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page).toHaveURL('/map');
  await expect(page.locator('#map-h')).toBeFocused();
  await waitForMap(page);
  await waitForCameraIdle(page);
  if (!isMobile) await expect(page.getByText(COPY.map.hint)).toBeVisible();
  const id = await pick(page, isMobile);
  const title = await albumTitle(page, id);
  const card = page.locator('.card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('aria-label', COPY.titles.album(title, await page.evaluate(async (i) => (await (await fetch('/data/albums.json')).json())[i].a, id)));
  await expect(card.locator('.t')).toHaveText(title);
  await expect(page.locator('.map-hint')).toBeHidden();
  await expect(card.getByRole('link', { name: new RegExp(`^${COPY.map.cardSpotify}`) })).toHaveAttribute('target', '_blank');
  await waitForCameraIdle(page);
  await shot(page, info, 'explore-card');
  const box = (await card.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  // The picked album is not under the card.
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
  const inside = p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
  expect(inside).toBe(false);
  if (isMobile) {
    // A bottom sheet resting on the slider panel, with the zoom controls out of its way.
    const slider = (await page.locator('.mode').boundingBox())!;
    expect(Math.abs(box.y + box.height - slider.y)).toBeLessThanOrEqual(1.5);
    expect(p.y).toBeLessThan(box.y - 12);
    await expect(page.locator('.map-zoom')).toBeHidden();
  }
  await card.getByRole('link', { name: COPY.map.cardPrimary }).click();
  await expect(page).toHaveURL(/\/album\//);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
});

test('the card closes with its button, with Escape and with a click on empty map', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pick(page, isMobile);
  await page.getByRole('button', { name: COPY.map.cardClose, exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(0);
  // Focus does not fall to the page body when the focused close button goes away.
  await expect(page.locator('canvas.map-canvas')).toBeFocused();
  await waitForCameraIdle(page);
  await pick(page, isMobile);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('.map-hint')).toHaveCount(1);
  await waitForCameraIdle(page);
  await pick(page, isMobile);
  await waitForCameraIdle(page);
  const empty = await emptyMapPoint(page);
  if (isMobile) await page.touchscreen.tap(empty.x, empty.y);
  else await page.mouse.click(empty.x, empty.y);
  await expect(page.locator('.card')).toHaveCount(0);
});

test('Escape in the header search does not close the card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'uses the desktop header search field');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pick(page, false);
  const input = page.locator('.top-search').getByRole('combobox', { name: COPY.search.label });
  await input.click();
  await input.fill('radio');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toBeVisible();
});

test('the hint hides once covers show and returns at the overview', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the hint is desktop only');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect(page.locator('.map-hint')).toBeVisible();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  await expect(page.locator('.map-hint')).toBeHidden();
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  await expect(page.locator('.map-hint')).toBeVisible();
});

test('closing an album returns to the map where it was', async ({ page, isMobile }) => {
  test.skip(isMobile, 'uses the desktop close control');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  await page.locator('canvas.map-canvas').focus();
  await page.keyboard.press('ArrowRight');
  await pick(page, false);
  await waitForCameraIdle(page);
  const saved = await camera(page);
  await page.getByRole('link', { name: COPY.map.cardPrimary }).click();
  await expect(page).toHaveURL(/\/album\//);
  await waitForCameraIdle(page);
  await page.getByRole('button', { name: COPY.album.close, exact: true }).click();
  await expect(page).toHaveURL('/map');
  await waitForCameraIdle(page);
  const back = await camera(page);
  expect(back.zoom).toBeCloseTo(saved.zoom, 2);
  expect(Math.abs(back.x - saved.x)).toBeLessThan(0.01);
  expect(Math.abs(back.y - saved.y)).toBeLessThan(0.01);
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.locator('#map-h')).toBeFocused();
});

test('leaving an album by the header nav leaves the album state clean and frames the whole map', async ({ page }) => {
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page).toHaveURL('/map');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = window.__rmr!.getState();
        return [s.focus, s.hot, s.ambient, s.mapMode, s.panelInset];
      }),
    )
    .toEqual([null, null, null, false, 0]);
  await waitForCameraIdle(page);
  // With no saved Explore camera, the map resets to the overview, not to the album's old framing.
  const overview = await page.evaluate(() => {
    const api = window.__rmr!.map!;
    const now = api.getCamera();
    api.reset();
    return now;
  });
  await waitForCameraIdle(page);
  const again = await camera(page);
  expect(again.zoom).toBeCloseTo(overview.zoom, 2);
});
