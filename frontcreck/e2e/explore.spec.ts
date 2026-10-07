import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { albumOnAnotherService, albumWithNoLink } from './data';
import { camera, shot, twinkleOff, visibleAlbumPoint, waitForCameraIdle, waitForMap } from './helpers';

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

/** In Rainbows in albums.json. */
const IN_RAINBOWS = 11;

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

type Box = { x: number; y: number; w: number; h: number };

/** Mean, over `boxes` (client px), of the standard deviation of luminance inside each box of one screenshot: how
 * much picture detail the covers there show against whatever is behind them. */
async function meanLumaStd(page: Page, boxes: Box[]): Promise<number> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rects]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      let total = 0;
      for (const r of rects) {
        const d = ctx.getImageData(Math.round(r.x * k), Math.round(r.y * k), Math.round(r.w * k), Math.round(r.h * k)).data;
        let sum = 0;
        let sq = 0;
        const n = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          sum += l;
          sq += l * l;
        }
        total += Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
      }
      return total / rects.length;
    },
    [png, boxes] as const,
  );
}

/** 20 px boxes at the centres of up to 12 covers on the canvas that stand alone: clear of the picked album's
 * enlarged cover and frame, of every overlay (the card, the slider, the zoom buttons), and of every other cover (no
 * other album within 27 px either way, so no 32 px neighbour reaches into the box). Such a box holds one cover's
 * picture, with nothing over it and only the gas and the page colour under it. */
async function otherCoverBoxes(page: Page, picked: number): Promise<Box[]> {
  return page.evaluate(async (pickedId) => {
    const api = window.__rmr!.map!;
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    const c = api.screenPoint(pickedId)!;
    const pts: ({ x: number; y: number } | null)[] = [];
    for (let id = 0; id < n; id++) pts.push(api.screenPoint(id));
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (let id = 0; id < n && out.length < 12; id++) {
      const p = pts[id];
      if (id === pickedId || !p || p.x < 10 || p.y < 10 || p.x > innerWidth - 10 || p.y > innerHeight - 10) continue;
      if (Math.abs(p.x - c.x) < 70 && Math.abs(p.y - c.y) < 70) continue;
      if (pts.some((q, j) => j !== id && q !== null && Math.abs(q.x - p.x) < 27 && Math.abs(q.y - p.y) < 27)) continue;
      const onCanvas = [[-10, -10], [10, -10], [-10, 10], [10, 10]].every(([dx, dy]) => document.elementFromPoint(p.x + dx, p.y + dy)?.classList.contains('map-canvas'));
      if (onCanvas) out.push({ x: p.x - 10, y: p.y - 10, w: 20, h: 20 });
    }
    return out;
  }, picked);
}

/** 20 px boxes at the centres of up to 12 covers on the canvas that lie in a pile: another album within 16 px both
 * ways, so a 32 px neighbour covers at least a quarter of the box (or lies under it). Clear of the picked album
 * and of every overlay, as otherCoverBoxes. What such a box shows is how stepped-back covers lie on each other. */
async function pileCoverBoxes(page: Page, picked: number): Promise<Box[]> {
  return page.evaluate(async (pickedId) => {
    const api = window.__rmr!.map!;
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    const c = api.screenPoint(pickedId)!;
    const pts: ({ x: number; y: number } | null)[] = [];
    for (let id = 0; id < n; id++) pts.push(api.screenPoint(id));
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (let id = 0; id < n && out.length < 12; id++) {
      const p = pts[id];
      if (id === pickedId || !p || p.x < 10 || p.y < 10 || p.x > innerWidth - 10 || p.y > innerHeight - 10) continue;
      if (Math.abs(p.x - c.x) < 70 && Math.abs(p.y - c.y) < 70) continue;
      if (!pts.some((q, j) => j !== id && j !== pickedId && q !== null && Math.abs(q.x - p.x) < 16 && Math.abs(q.y - p.y) < 16)) continue;
      // Not a box that overlaps one already taken: each pile is counted once.
      if (out.some((b) => Math.abs(b.x + 10 - p.x) < 20 && Math.abs(b.y + 10 - p.y) < 20)) continue;
      const onCanvas = [[-10, -10], [10, -10], [-10, 10], [10, 10]].every(([dx, dy]) => document.elementFromPoint(p.x + dx, p.y + dy)?.classList.contains('map-canvas'));
      if (onCanvas) out.push({ x: p.x - 10, y: p.y - 10, w: 20, h: 20 });
    }
    return out;
  }, picked);
}

/** The picked album's off-white frame (FRAME_RGB, rgb(241, 236, 228)). */
const isFrame = ([r, g, b]: number[]) => Math.abs(r - 241) < 16 && Math.abs(g - 236) < 16 && Math.abs(b - 228) < 18;

/**
 * Client coordinates on the canvas at least 40 px from every album. Where the map is too dense for that at the
 * current zoom (a phone, beside a picked album among 10,467), it zooms in a step at a time until there is one.
 */
async function emptyMapPoint(page: Page): Promise<{ x: number; y: number }> {
  for (let step = 0; step < 8; step++) {
    const p = await emptyMapPointNow(page);
    if (p) return p;
    await page.evaluate(() => window.__rmr!.map!.zoomBy(1.6));
    await waitForCameraIdle(page);
  }
  throw new Error('no empty map point');
}

async function emptyMapPointNow(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(async () => {
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

test('the hint hides once covers show and returns at the whole map', async ({ page, isMobile }) => {
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

/** Detail left in a cover that stepped back, as a fraction of its undimmed detail. A lone cover at half strength
 * (SELECTION_DIM) keeps half: measured 0.48 on desktop and 0.50 on the phone, three runs each, when the stepping
 * back was by alpha. In a pile the upper cover's half-opaque picture then let the lower one through, so more was
 * left: measured 0.57 (12 piles, desktop) and 0.60 (4 piles, phone). Since the 10k catalog a stepped-back cover
 * keeps its alpha and moves to the page colour, so a pile should keep about half too (not measured again).
 * With the stepping back removed both are 1. */
const LONE_LINE = 0.6;
const PILE_LINE = 0.75;

test('in cover mode the picked album is drawn large on top, framed in off-white, with the other covers dimmed', async ({ page, isMobile }, info) => {
  // The frame and the covers are read from screenshot pixels with gas behind them.
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await twinkleOff(page);
  await pickKnown(page, isMobile, IN_RAINBOWS);
  await shot(page, info, 'explore-selected-cover');
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  // Covers are 32 px here, so the picked one is 64 px with a 2 px off-white frame 4 px outside it (centre 36 px out).
  const framePoints = [
    { x: p.x + 36, y: p.y },
    { x: p.x - 36, y: p.y },
    { x: p.x, y: p.y - 36 },
    { x: p.x + 20, y: p.y - 36 },
  ];
  expect((await pixels(page, framePoints)).map(isFrame)).toEqual([true, true, true, true]);
  await expect(page.locator('.map-sel')).toHaveCSS('opacity', '0');
  // The hit area matches the drawn size: a click well outside a plain cover, near its corner, still lands on it.
  if (isMobile) await page.touchscreen.tap(p.x + 24, p.y + 24);
  else await page.mouse.click(p.x + 24, p.y + 24);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.getState().selected)).toBe(IN_RAINBOWS);
  await expect(page.locator('.card')).toBeVisible();
  // The other covers step back while the pick lasts: each is drawn at half opacity (alpha, as before the theme), so
  // the gas and the page colour show through it. That can make a cover brighter or darker, so brightness says
  // nothing. Compare the picture detail inside the same covers, with the pick and without it (the camera does not
  // move). The boxes are on covers that stand alone, and the gas is smooth across 20 px, so a cover at half opacity
  // shows half its detail whatever is behind it.
  if (!isMobile) await page.mouse.move(2, 2); // off the map: no hover label or hover ring over the sampled covers
  await waitForCameraIdle(page);
  const boxes = await otherCoverBoxes(page, IN_RAINBOWS);
  expect(boxes.length, 'covers that stand alone, to compare').toBeGreaterThanOrEqual(4);
  const dimmed = await meanLumaStd(page, boxes);
  // The piles too: covers that lie on each other step back together, each at half opacity, so a pile keeps a soft
  // layered look and still loses detail.
  const piles = await pileCoverBoxes(page, IN_RAINBOWS);
  expect(piles.length, 'covers in piles, to compare').toBeGreaterThanOrEqual(4);
  const pilesDimmed = await meanLumaStd(page, piles);
  await page.keyboard.press('Escape');
  await expect(page.locator('.card')).toHaveCount(0);
  await waitForCameraIdle(page);
  const plain = await meanLumaStd(page, boxes);
  const pilesPlain = await meanLumaStd(page, piles);
  console.log(
    `picked cover: detail in ${boxes.length} lone covers ${dimmed.toFixed(2)} with the pick, ${plain.toFixed(2)} without (ratio ${(dimmed / plain).toFixed(2)}); ` +
      `in ${piles.length} piles ${pilesDimmed.toFixed(2)} with, ${pilesPlain.toFixed(2)} without (ratio ${(pilesDimmed / pilesPlain).toFixed(2)})`,
  );
  expect(plain, 'the undimmed covers show detail').toBeGreaterThan(6);
  expect(dimmed).toBeLessThan(plain * LONE_LINE);
  expect(pilesPlain, 'the undimmed piles show detail').toBeGreaterThan(6);
  expect(pilesDimmed, 'covers in piles step back too').toBeLessThan(pilesPlain * PILE_LINE);
  // With the pick gone the frame is gone: none of the same four points is frame-coloured, so the frame check
  // above was not satisfied by pale gas or a pale cover at any of them.
  expect((await pixels(page, framePoints)).map(isFrame)).toEqual([false, false, false, false]);
});

test('an album with no place to listen shows the card without a listen action', async ({ page, isMobile }) => {
  // Found in the data: no Spotify release and no other link.
  const none = albumWithNoLink({ onMap: true });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pickKnown(page, isMobile, none.id);
  const card = page.locator('.card');
  await expect(card.locator('.t')).toHaveText(none.title);
  await expect(card.getByRole('link', { name: COPY.map.cardPrimary })).toHaveAttribute('href', `/album/${none.slug}`);
  await expect(card.getByRole('link')).toHaveCount(1);
  await expect(card.locator('a[target="_blank"]')).toHaveCount(0);
});

test('an album that is not on Spotify shows the card with its other service', async ({ page, isMobile }) => {
  // Found in the data: no Spotify release, a link to another service.
  const other = albumOnAnotherService({ onMap: true });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await pickKnown(page, isMobile, other.id);
  const card = page.locator('.card');
  await expect(card.locator('.t')).toHaveText(other.title);
  await expect(card.getByRole('link', { name: COPY.map.cardPrimary })).toHaveAttribute('href', `/album/${other.slug}`);
  const listen = card.locator('a[target="_blank"]');
  await expect(listen).toHaveCount(1);
  await expect(listen).toHaveAccessibleName(`${other.listen.name} ${COPY.album.newTab}`);
  await expect(listen).toHaveAttribute('href', other.listen.url);
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

/** Albums at the edges of the balanced layout (indices into albums.json): Milestones, which sits just above the
 * cloud's lower edge in a dense spot, then the lowest, the highest, the leftmost and the rightmost album. */
const EDGE_ALBUMS = [
  ['Milestones, near the lower edge', 1158],
  ['the lowest album', 408],
  ['the highest album', 3595],
  ['the leftmost album', 3684],
  ['the rightmost album', 557],
] as const;
/** Half the picked cover with its frame: 64 px cover, 4 px gap, 2 px frame (shaders/album.ts SELECTED_*). */
const PICKED_HALF_PX = 64 / 2 + 4 + 2;
/** Clear space asked for round the picked cover. */
const SPARE_PX = 4;

/** The map at rest: the camera has stopped, and the pull back onto the cloud, which starts half a second after the
 * last camera move (CameraBounds RELEASE_MS), has had its turn and has stopped too. */
async function mapAtRest(page: Page): Promise<void> {
  await waitForCameraIdle(page);
  await page.waitForTimeout(800);
  await waitForCameraIdle(page);
}

for (const [name, id] of EDGE_ALBUMS) {
  test(`on a phone a picked album at the edge of the cloud rests whole between the header and the card: ${name}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the card is a bottom sheet on phones only');
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await page.evaluate((i) => window.__rmr!.map!.flyTo(i), id);
    await mapAtRest(page);
    const at = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
    await page.touchscreen.tap(at.x, at.y);
    // In a pile the tap may take a neighbour a few px away: whichever album was picked must land clear.
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
    const picked = (await page.evaluate(() => window.__rmr!.getState().selected))!;
    await expect(page.locator('.card')).toBeVisible();
    await mapAtRest(page);
    const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), picked))!;
    const cardTop = await page.locator('.card').evaluate((el) => el.getBoundingClientRect().top);
    const headerBottom = await page.locator('header.top').evaluate((el) => el.getBoundingClientRect().bottom);
    const width = page.viewportSize()!.width;
    expect(p.y + PICKED_HALF_PX + SPARE_PX, `album ${picked}: bottom of the picked cover against the card's top edge (${cardTop})`).toBeLessThanOrEqual(cardTop);
    expect(p.y - PICKED_HALF_PX - SPARE_PX, `album ${picked}: top of the picked cover against the header's bottom edge (${headerBottom})`).toBeGreaterThanOrEqual(headerBottom);
    expect(p.x - PICKED_HALF_PX - SPARE_PX, `album ${picked}: left side of the picked cover`).toBeGreaterThanOrEqual(0);
    expect(p.x + PICKED_HALF_PX + SPARE_PX, `album ${picked}: right side of the picked cover`).toBeLessThanOrEqual(width);
    // It stays there: no later pull moves it.
    await page.waitForTimeout(1200);
    const later = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), picked))!;
    expect(Math.abs(later.y - p.y)).toBeLessThan(0.5);
    expect(Math.abs(later.x - p.x)).toBeLessThan(0.5);
  });
}

// The slider panel covers the bottom 165 px of a phone's map. One zoom step out from covers, the pull back onto the
// cloud used to leave these albums under it, where a tap lands on the slider and picks nothing (the review capture's
// tap on Milestones: flyTo, "-", "+", tap).
for (const [name, id] of [EDGE_ALBUMS[0], EDGE_ALBUMS[1]]) {
  test(`on a phone an album at the lower edge rests above the slider panel one zoom step out from covers and back in, and a tap picks it: ${name}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the slider panel covers the bottom of the map on phones only');
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await page.evaluate((i) => window.__rmr!.map!.flyTo(i), id);
    await mapAtRest(page);
    await page.locator('canvas.map-canvas').focus();
    await page.keyboard.press('-');
    await mapAtRest(page);
    const sliderTop = await page.locator('.mode').evaluate((el) => el.getBoundingClientRect().top);
    const out = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
    // Covers are about 23 px here; 16 px is half of the largest they can be before the next step in.
    expect(out.y + 16 + SPARE_PX, `album ${id}, one step out, against the slider panel's top edge (${sliderTop})`).toBeLessThanOrEqual(sliderTop);
    await page.keyboard.press('+');
    await mapAtRest(page);
    const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
    expect(p.y + 16 + SPARE_PX, `album ${id}, back at covers, against the slider panel's top edge (${sliderTop})`).toBeLessThanOrEqual(sliderTop);
    // The tap reaches the map, not the slider: an album is picked (in a pile, maybe a neighbour a few px away).
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, p)).toBe('CANVAS');
    await page.touchscreen.tap(p.x, p.y);
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
  });
}
