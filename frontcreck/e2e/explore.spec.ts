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

/** In Rainbows and The KLF's Chill Out (no Spotify id) in albums.json. */
const IN_RAINBOWS = 11;
const CHILL_OUT = 2348;

/** Flies to a known album, then clicks or taps it for real, so the card shows a known album. */
async function pickKnown(page: Page, isMobile: boolean, id: number): Promise<void> {
  await page.evaluate((i) => window.__rmr!.map!.flyTo(i), id);
  await waitForCameraIdle(page);
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).toBe(id);
  await waitForCameraIdle(page);
}

/** RGB of screenshot pixels at client coordinates (device pixels are read at the CSS point). */
async function pixels(page: Page, points: { x: number; y: number }[]): Promise<number[][]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      return pts.map((q) => [...ctx.getImageData(Math.round(q.x * k), Math.round(q.y * k), 1, 1).data.slice(0, 3)]);
    },
    [png, points] as const,
  );
}

/** Mean luminance of a client-px rectangle of the screenshot. */
async function meanLuma(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<number> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rect]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const d = ctx.getImageData(Math.round(rect.x * k), Math.round(rect.y * k), Math.round(rect.w * k), Math.round(rect.h * k)).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return sum / (d.length / 4);
    },
    [png, r] as const,
  );
}

const isLamp = ([r, g, b]: number[]) => Math.abs(r - 230) < 30 && Math.abs(g - 168) < 30 && Math.abs(b - 86) < 35;

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
  const id = IN_RAINBOWS;
  await pickKnown(page, isMobile, id);
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

test('a tap on empty map moves focus off the focused control', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch taps only');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const range = page.getByRole('slider', { name: COPY.slider.label });
  await range.focus();
  const empty = await emptyMapPoint(page);
  await page.touchscreen.tap(empty.x, empty.y);
  // Only a pick guards against the tap's follow-up mousedown; on empty map it moves focus as usual.
  await expect(range).not.toBeFocused();
  await expect(page.locator('canvas.map-canvas')).toBeFocused();
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

test('"Explore this area" drops the album and leaves the map where it was', async ({ page, isMobile }) => {
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  // Phones show it in map mode only, opposite the List button.
  if (isMobile) {
    await expect(page.getByRole('button', { name: COPY.map.exploreHere })).toBeHidden();
    await page.getByRole('button', { name: COPY.phone.mapLabel }).click();
  }
  await expect(page.locator('.mk')).toHaveCount(6);
  await waitForCameraIdle(page);
  const before = await camera(page);
  await page.getByRole('button', { name: COPY.map.exploreHere }).click();
  await expect(page).toHaveURL('/map');
  await expect(page.locator('.mk')).toHaveCount(0);
  await expect(page.getByRole('button', { name: COPY.map.exploreHere })).toHaveCount(0);
  await expect(page.locator('#map-h')).toBeFocused();
  await waitForCameraIdle(page);
  const after = await camera(page);
  expect(after.zoom).toBeCloseTo(before.zoom, 5);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1e-6);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1e-6);
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().focus)).toBeNull();
  // A pick now opens the Explore card, not the album.
  await pick(page, isMobile);
  await expect(page.locator('.card')).toBeVisible();
  await expect(page).toHaveURL('/map');
  await page.goBack();
  await expect(page).toHaveURL('/album/in-rainbows-radiohead');
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
        return [s.focus, s.hot, s.ambient, s.mapModeFor, s.panelInset];
      }),
    )
    .toEqual([null, null, null, null, 0]);
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

test('in cover mode the picked album is drawn large on top, framed in lamp, with the other covers dimmed', async ({ page, isMobile }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pickKnown(page, isMobile, IN_RAINBOWS);
  await shot(page, info, 'explore-selected-cover');
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  // Covers are 32 px here, so the picked one is 64 px with a 2 px lamp frame 4 px outside it (centre 36 px out).
  const frame = await pixels(page, [
    { x: p.x + 36, y: p.y },
    { x: p.x - 36, y: p.y },
    { x: p.x, y: p.y - 36 },
    { x: p.x + 20, y: p.y - 36 },
  ]);
  expect(frame.map(isLamp)).toEqual([true, true, true, true]);
  await expect(page.locator('.map-sel')).toHaveCSS('opacity', '0');
  // The hit area matches the drawn size: a click well outside a plain cover, near its corner, still lands on it.
  if (isMobile) await page.touchscreen.tap(p.x + 24, p.y + 24);
  else await page.mouse.click(p.x + 24, p.y + 24);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.getState().selected)).toBe(IN_RAINBOWS);
  await expect(page.locator('.card')).toBeVisible();
  // The other covers are dimmed while the pick lasts: compare a band of covers away from it (left of it on
  // desktop, above it on the phone) with the same band once the card is closed (the camera does not move).
  const vp = page.viewportSize()!;
  const region = isMobile ? { x: 16, y: 140, w: vp.width - 32, h: 150 } : { x: p.x - 420, y: p.y - 200, w: 300, h: 400 };
  const dimmed = await meanLuma(page, region);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
  await waitForCameraIdle(page);
  const plain = await meanLuma(page, region);
  const PANE_LUMA = 19; // #17120e
  expect(dimmed - PANE_LUMA).toBeLessThan((plain - PANE_LUMA) * 0.7);
});

test('an album with no Spotify id shows the card without the Spotify action', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pickKnown(page, isMobile, CHILL_OUT);
  const card = page.locator('.card');
  await expect(card.locator('.t')).toHaveText('Chill Out');
  await expect(card.getByRole('link', { name: COPY.map.cardPrimary })).toHaveAttribute('href', '/album/chill-out-the-klf');
  await expect(card.getByRole('link', { name: new RegExp(`^${COPY.map.cardSpotify}`) })).toHaveCount(0);
});

test('browser Back from an album returns to the map where it was', async ({ page, isMobile }) => {
  test.skip(isMobile, 'same path as desktop; the camera check needs the desktop split view');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  await pick(page, false);
  await waitForCameraIdle(page);
  const saved = await camera(page);
  await page.getByRole('link', { name: COPY.map.cardPrimary }).click();
  await expect(page).toHaveURL(/\/album\//);
  await waitForCameraIdle(page);
  await page.goBack();
  await expect(page).toHaveURL('/map');
  await waitForCameraIdle(page);
  const back = await camera(page);
  expect(back.zoom).toBeCloseTo(saved.zoom, 2);
  expect(Math.abs(back.x - saved.x)).toBeLessThan(0.01);
  expect(Math.abs(back.y - saved.y)).toBeLessThan(0.01);
});

test('the hint stays hidden over covers after a trip to About and back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the hint is desktop only');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  await expect(page.locator('.map-hint')).toBeHidden();
  const nav = page.getByRole('navigation', { name: COPY.nav.label });
  await nav.getByRole('link', { name: COPY.nav.about, exact: true }).click();
  await expect(page).toHaveURL('/about');
  await waitForCameraIdle(page);
  const zoomed = await page.evaluate(() => window.__rmr!.map!.getCamera().zoom);
  // Sample the hint's opacity every frame from before it mounts: it must never show, not even for the frames
  // before the map draws again and then fade out.
  await page.evaluate(() => {
    const w = window as unknown as { __hintMax: number; __hintDone: boolean };
    w.__hintMax = 0;
    w.__hintDone = false;
    const until = performance.now() + 1500;
    const tick = () => {
      const el = document.querySelector('.map-hint');
      if (el) {
        const cs = getComputedStyle(el);
        if (cs.visibility !== 'hidden') w.__hintMax = Math.max(w.__hintMax, Number(cs.opacity));
      }
      if (performance.now() < until) requestAnimationFrame(tick);
      else w.__hintDone = true;
    };
    requestAnimationFrame(tick);
  });
  await nav.getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page).toHaveURL('/map');
  expect(await page.evaluate(() => window.__rmr!.map!.getCamera().zoom)).toBeCloseTo(zoomed, 5);
  await expect(page.locator('.map-hint')).toBeHidden();
  await page.waitForFunction(() => (window as unknown as { __hintDone: boolean }).__hintDone, null, { timeout: 5000 });
  expect(await page.evaluate(() => (window as unknown as { __hintMax: number }).__hintMax)).toBeLessThan(0.05);
});
