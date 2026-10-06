import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, albumSpread, overviewMiss, visibleAlbumPoint, waitForAnimations, waitForCameraIdle, waitForMap, wholeMapMiss } from './helpers';

/** Album positions on screen, recorded while the map still started below the header (FRAMING_RECORD=1, run once on
 * the commit before the change). Every "same place" test compares with it, so the framing is that commit's to the
 * pixel. Never record it again. */
const BASELINE = path.join(process.cwd(), 'e2e/fixtures/framing-baseline.json');
const RECORD = process.env.FRAMING_RECORD === '1';
const TOLERANCE_PX = 0.75;
const IR = '/album/in-rainbows-radiohead';
const IN_RAINBOWS = 11;
/** Albums spread over the catalogue (indices into albums.json). One that is off screen still has a position. */
const PROBES = [0, 11, 42, 1158, 2000, 4000];

type Pt = { x: number; y: number };
type Box = { id: number; x: number; y: number; w: number; h: number };
type Entry = { points: Pt[]; markers: Box[] };

const headerBottom = (page: Page) => page.locator('header.top').evaluate((el) => el.getBoundingClientRect().bottom);
const pointOf = async (page: Page, id: number) => (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
const points = (page: Page) => page.evaluate((ids) => ids.map((id) => window.__rmr!.map!.screenPoint(id)!), PROBES);
const markers = (page: Page) =>
  page.locator('.mk').evaluateAll((els) =>
    els
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { id: Number((e as HTMLElement).dataset.albumId), x: r.x, y: r.y, w: r.width, h: r.height };
      })
      .sort((a, b) => a.id - b.id),
  );

/** With an album open, the covers ease onto their settled layout for 180 ms in the DOM after a motion ends
 * (MarkerDriver MARKER_SETTLE_MS; requestAnimationFrame, so waitForAnimations does not see it). The hook is null
 * while that ease runs. With no album open there is nothing to wait for. */
const markersSettled = (page: Page) => page.waitForFunction(() => !document.querySelector('.mk') || !!window.__rmr!.markerLayout?.());

/** Records this state's album positions and marker boxes (FRAMING_RECORD=1), or compares them with the record.
 * `again` compares in a recording run too: a state reached a second time must be the one just recorded. */
async function sameAsRecorded(page: Page, info: TestInfo, state: string, again = false): Promise<void> {
  await markersSettled(page);
  const key = `${info.project.name}/${state}`;
  const now: Entry = { points: await points(page), markers: await markers(page) };
  const all: Record<string, Entry> = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  if (RECORD && !again) {
    all[key] = now;
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, `${JSON.stringify(all, null, 1)}\n`);
    return;
  }
  const was = all[key];
  expect(was, `no recorded framing for ${key}: it is recorded on the commit before the header change`).toBeTruthy();
  expect(now.points.length).toBe(was.points.length);
  // The largest distance from the record, for the run's log.
  let worst = 0;
  now.points.forEach((p, i) => (worst = Math.max(worst, Math.abs(p.x - was.points[i].x), Math.abs(p.y - was.points[i].y))));
  if (now.markers.length === was.markers.length) now.markers.forEach((m, i) => (['x', 'y', 'w', 'h'] as const).forEach((k) => (worst = Math.max(worst, Math.abs(m[k] - was.markers[i][k])))));
  console.log(`framing ${key}: at most ${worst.toFixed(3)} px from the record`);
  now.points.forEach((p, i) => {
    expect(Math.abs(p.x - was.points[i].x), `${key} album ${PROBES[i]} x`).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(p.y - was.points[i].y), `${key} album ${PROBES[i]} y`).toBeLessThanOrEqual(TOLERANCE_PX);
  });
  expect(now.markers.map((m) => m.id)).toEqual(was.markers.map((m) => m.id));
  now.markers.forEach((m, i) => {
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(m[k] - was.markers[i][k]), `${key} marker ${m.id} ${k}`).toBeLessThanOrEqual(TOLERANCE_PX);
  });
}

async function openMap(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
}

/** The fit button: from the Overview the map opens at to the Whole map. */
async function fit(page: Page, isMobile: boolean): Promise<void> {
  await act(page.getByRole('button', { name: COPY.map.reset }), isMobile);
  await waitForCameraIdle(page);
}

/** Flies to an album, then clicks or taps it for real (as explore.spec does), so the card opens and, on a phone,
 * the album settles above the sheet. */
async function pick(page: Page, isMobile: boolean, id: number): Promise<void> {
  await page.evaluate((i) => window.__rmr!.map!.flyTo(i), id);
  await waitForCameraIdle(page);
  const p = await pointOf(page, id);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).toBe(id);
  await expect(page.locator('.card')).toBeVisible();
  await waitForCameraIdle(page);
  await waitForAnimations(page);
}

/** An open album with its map showing: the split view on desktop, map mode on a phone. */
async function openAlbum(page: Page, isMobile: boolean): Promise<void> {
  await page.goto(IR);
  await waitForMap(page);
  if (isMobile) {
    await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
    // Map mode makes the map interactive, which starts the other two stops' gas: wait for it to settle again.
    await waitForMap(page);
  }
  await expect(page.locator('.mk')).toHaveCount(6);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await markersSettled(page);
}

/** The highest album on screen, in client px. */
const highestAlbum = (page: Page) =>
  page.evaluate(async () => {
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    let top = Infinity;
    for (let id = 0; id < n; id++) top = Math.min(top, window.__rmr!.map!.screenPoint(id)!.y);
    return top;
  });

/** A focus that reaches the top edge: the highest album on screen as the seed, the albums closest to it on screen
 * (which the ring pushes around it) and the lowest album (so the framing is limited vertically). The mirror of
 * focus.spec's bottomEdgeFocus. */
async function topEdgeFocus(page: Page): Promise<{ seed: number; recs: number[] }> {
  return page.evaluate(() => {
    const api = window.__rmr!.map!;
    const pts: { id: number; x: number; y: number }[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      pts.push({ id, ...p });
    }
    const high = pts.reduce((a, b) => (b.y < a.y ? b : a));
    const low = pts.reduce((a, b) => (b.y > a.y ? b : a));
    const near = pts
      .filter((p) => p.id !== high.id && p.id !== low.id)
      .sort((a, b) => Math.hypot(a.x - high.x, a.y - high.y) - Math.hypot(b.x - high.x, b.y - high.y))
      .slice(0, 6)
      .map((p) => p.id);
    return { seed: high.id, recs: [...near, low.id] };
  });
}

test.describe('same place as before the map ran under the header', () => {
  test('the opening view, the whole map and the zoom-out floor', async ({ page, isMobile }, info) => {
    await openMap(page);
    // /map opens at the Overview (a crop of the cloud).
    await sameAsRecorded(page, info, 'opening');
    await fit(page, isMobile);
    await sameAsRecorded(page, info, 'whole');
    // The zoom-out floor is 0.8 of the Whole map; the second press is a no-op.
    const zoomOut = page.getByRole('button', { name: COPY.map.zoomOut });
    for (let i = 0; i < 2; i++) {
      await act(zoomOut, isMobile);
      await waitForCameraIdle(page);
    }
    await sameAsRecorded(page, info, 'floor');
    // The fit button comes back to the Whole map exactly.
    await fit(page, isMobile);
    await sameAsRecorded(page, info, 'whole', true);
  });

  test('a picked album', async ({ page, isMobile }, info) => {
    await openMap(page);
    await pick(page, isMobile, IN_RAINBOWS);
    await sameAsRecorded(page, info, 'pick');
  });

  test('an open album and its closest albums', async ({ page, isMobile }, info) => {
    await openAlbum(page, isMobile);
    await sameAsRecorded(page, info, 'album');
  });

  test('an album opened from the header search', async ({ page, isMobile }, info) => {
    test.skip(isMobile, 'the phone search sheet lands on the album list; its map is the "open album" state');
    await openMap(page);
    const field = page.locator('.top-search').getByRole('combobox');
    await field.click();
    await field.pressSequentially('loveless');
    await page.getByRole('option').first().click();
    await expect(page).toHaveURL(/\/album\/loveless/);
    await expect(page.locator('.mk')).toHaveCount(6);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await sameAsRecorded(page, info, 'search');
  });

  test('the deepest zoom', async ({ page }, info) => {
    await openMap(page);
    await page.evaluate((i) => window.__rmr!.map!.flyTo(i), IN_RAINBOWS);
    await waitForCameraIdle(page);
    // Far past the ceiling: the clamp decides where it stops, so this pins the ceiling's size on screen.
    await page.evaluate(() => window.__rmr!.map!.zoomBy(1000));
    await waitForCameraIdle(page);
    await sameAsRecorded(page, info, 'deepest');
  });
});

test('the nebula runs behind the header: the canvas starts at the top of the window, the stage does not', async ({ page, isMobile }) => {
  await openMap(page);
  const vp = page.viewportSize()!;
  const bottom = await headerBottom(page);
  // --hdr: 64 px, and 60 px under 900 px wide.
  expect(bottom).toBe(isMobile ? 60 : 64);
  const canvas = (await page.locator('canvas.map-canvas').boundingBox())!;
  expect(canvas.y).toBe(0);
  expect(canvas.height).toBe(vp.height);
  // The page layers and the map's controls still start at the header's bottom edge.
  expect((await page.locator('#stage').boundingBox())!.y).toBe(bottom);
  expect((await page.locator('.map-ui').boundingBox())!.y).toBe(bottom);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('after every fit nothing is behind the header', async ({ page, isMobile }) => {
  await openMap(page);
  const bottom = await headerBottom(page);
  // The Overview is a crop: albums run off the top by design. Its median row sits in the middle of the area below
  // the bar (and above the phone's slider panel), with the 24 px side margins.
  expect(overviewMiss(await albumSpread(page))).toEqual([]);
  // The Whole map: every album is below the bar by the fit's top padding (55 px on desktop, 90 on a phone).
  await fit(page, isMobile);
  expect(await highestAlbum(page)).toBeGreaterThanOrEqual(bottom + (isMobile ? 90 : 55) - 1);
  expect(wholeMapMiss(await albumSpread(page), isMobile)).toEqual([]);
  // A picked album: its 64 px cover and the frame 6 px outside it clear the bar.
  await pick(page, isMobile, IN_RAINBOWS);
  expect((await pointOf(page, IN_RAINBOWS)).y).toBeGreaterThanOrEqual(bottom + 38);
  // An open album: every cover marker and every rank badge.
  await openAlbum(page, isMobile);
  const tops = await page.locator('.mk, .mk-n').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops.length).toBe(11);
  for (const t of tops) expect(t).toBeGreaterThanOrEqual(bottom);
});

test('markers stay below the header, also after the visitor has moved the map', async ({ page }) => {
  await openMap(page);
  const bottom = await headerBottom(page);
  const focus = await topEdgeFocus(page);
  await page.evaluate(([s, r]) => window.__rmr!.getState().setFocus({ seed: s, recs: [...r] }), [focus.seed, focus.recs] as const);
  await waitForCameraIdle(page);
  await expect(page.locator('.mk')).toHaveCount(focus.recs.length + 1);
  const tops = () => page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  await markersSettled(page);
  // 8 px is the markers' edge (MarkerDriver MARKER_EDGE), less half a pixel of rounding.
  for (const t of await tops()) expect(t, 'framed').toBeGreaterThanOrEqual(bottom + 7.5);
  // Slide the albums up until the seed sits behind the bar; the layout bounds still keep every marker below it.
  const before = (await pointOf(page, focus.seed)).y;
  const shift = before - (bottom - 30);
  await page.evaluate((dy) => window.__rmr!.map!.panBy(0, dy), -shift);
  if ((await pointOf(page, focus.seed)).y > before) await page.evaluate((dy) => window.__rmr!.map!.panBy(0, dy), 2 * shift);
  expect((await pointOf(page, focus.seed)).y, 'the seed album is behind the bar').toBeLessThan(bottom - 20);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // While the covers ease onto the settled layout, and once they have.
  for (const t of await tops()) expect(t, 'while the covers ease after the move').toBeGreaterThanOrEqual(bottom + 7.5);
  await markersSettled(page);
  for (const t of await tops()) expect(t, 'after the camera moved').toBeGreaterThanOrEqual(bottom + 7.5);
});

test('the hover label never slides under the header', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer hover');
  await openMap(page);
  const bottom = await headerBottom(page);
  // One step in, so albums sit right under the bar; then the highest album the pointer can still reach.
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  const p = await page.evaluate(async (minY) => {
    const n: number = (await (await fetch('/data/albums.json')).json()).length;
    let best: { x: number; y: number } | null = null;
    for (let id = 0; id < n; id++) {
      const q = window.__rmr!.map!.screenPoint(id)!;
      if (q.y < minY + 4 || q.x < 60 || q.x > innerWidth - 320) continue;
      if (!document.elementFromPoint(q.x, q.y)?.classList.contains('map-canvas')) continue;
      if (!best || q.y < best.y) best = q;
    }
    return best;
  }, bottom);
  expect(p, 'an album just below the bar').not.toBeNull();
  expect(p!.y, 'close enough to the bar that the label cannot sit above it').toBeLessThan(bottom + 60);
  await page.mouse.move(p!.x, p!.y);
  const tip = page.locator('.map-tip');
  await expect(tip).toHaveCSS('opacity', '1');
  // 8 px is the label's edge (OverlayDriver TIP_EDGE), less half a pixel of rounding.
  expect((await tip.boundingBox())!.y).toBeGreaterThanOrEqual(bottom + 7.5);
});

test('the header takes the pointer over the map under it; a drag that starts on the map carries on under it', async ({ page, isMobile }) => {
  await openMap(page);
  const vp = page.viewportSize()!;
  const bottom = await headerBottom(page);
  // Every point of the bar belongs to the header, never to the canvas under it.
  const owners = await page.evaluate(
    ([w, y]) => {
      const out: boolean[] = [];
      for (let x = 4; x < w; x += 12) out.push(!!document.elementFromPoint(x, y)?.closest('header.top'));
      return out;
    },
    [vp.width, bottom / 2] as const,
  );
  expect(owners.every(Boolean)).toBe(true);
  if (isMobile) return;
  // Hover ends when the pointer moves from an album onto the bar.
  const p = await visibleAlbumPoint(page);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator('.map-tip')).toHaveCSS('opacity', '1');
  await page.mouse.move(p.x, bottom / 2);
  await expect(page.locator('.map-tip')).toHaveCSS('opacity', '0');
  // A click on an empty part of the bar picks nothing and goes nowhere.
  const gap = await page.evaluate((y) => {
    for (let x = 8; x < innerWidth; x += 8) if (document.elementFromPoint(x, y)?.matches('header.top')) return x;
    return -1;
  }, bottom / 2);
  expect(gap, 'an empty spot on the bar').toBeGreaterThan(0);
  await page.mouse.click(gap, bottom / 2);
  expect(await page.evaluate(() => window.__rmr!.getState().selected)).toBeNull();
  await expect(page).toHaveURL('/map');
  // A drag that starts on the map keeps panning while the pointer is over the bar (the canvas holds the pointer).
  const y0 = (await pointOf(page, p.id)).y;
  const startY = bottom + 180;
  await page.mouse.move(vp.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2, bottom / 2, { steps: 10 });
  await page.waitForTimeout(150); // held before the release, so there is no fling (CameraRig FLING_MAX_IDLE_MS is 80)
  await page.mouse.up();
  await waitForCameraIdle(page);
  const y1 = (await pointOf(page, p.id)).y;
  expect(Math.abs(y1 - y0 + (startY - bottom / 2))).toBeLessThanOrEqual(4);
});

test('keyboard order is unchanged: skip link, header, then the map and its controls', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await openMap(page);
  const where: string[] = [];
  // Ten stops: the skip link, the header's four (wordmark, search, Map, About), the canvas, the slider, the names
  // button, zoom in, zoom out. The slider's three stop buttons are not tab stops.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    where.push(
      await page.evaluate(() => {
        const el = document.activeElement!;
        if (el.classList.contains('skip')) return 'skip';
        if (el.closest('header.top')) return 'header';
        if (el.classList.contains('map-canvas')) return 'canvas';
        return el.closest('#stage') ? 'stage' : 'other';
      }),
    );
  }
  // One skip link, then every header control, then only the stage: nothing of the header comes after the map.
  expect(where[0]).toBe('skip');
  const firstStage = where.findIndex((w) => w === 'stage' || w === 'canvas');
  expect(firstStage).toBeGreaterThan(1);
  expect(where.slice(1, firstStage).every((w) => w === 'header')).toBe(true);
  expect(where.slice(firstStage).every((w) => w === 'stage' || w === 'canvas')).toBe(true);
  expect(where).toContain('canvas');
  // The canvas's focus ring is drawn inside the visible map: 4 px below the bar, not under it.
  for (let i = 0; i < 10 && !(await page.evaluate(() => !!document.activeElement?.classList.contains('map-canvas'))); i++) await page.keyboard.press('Shift+Tab');
  await expect(page.locator('canvas.map-canvas')).toBeFocused();
  const ring = await page.locator('.map-host').evaluate((el) => {
    const cs = getComputedStyle(el, '::after');
    return { top: cs.top, style: cs.borderTopStyle, width: cs.borderTopWidth };
  });
  expect(ring).toEqual({ top: '68px', style: 'solid', width: '2px' });
});

// TODO(part2-task8): twinkleOff(page) is not on the branch yet, and neither is the glint layer (.tw-layer). The
// plan's twelfth test, "glints never start under the header" (plan Task 3 Step 1), is added with part 2 Task 8.
