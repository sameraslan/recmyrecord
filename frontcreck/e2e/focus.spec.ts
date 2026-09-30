import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { camera, shot, waitForCameraIdle, waitForMap } from './helpers';

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

/** Centre of a marker in client px. */
async function markerCentre(page: Page, id: number): Promise<{ x: number; y: number }> {
  const box = (await page.locator(`.mk[data-album-id="${id}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openFocus(page: Page): Promise<number[]> {
  await page.goto('/map');
  await waitForMap(page);
  const recs = await recsOf(page, 11, 'balanced');
  await setFocus(page, 11, recs);
  await waitForCameraIdle(page);
  return recs;
}

test('focus draws numbered covers joined to the seed, framed on screen', async ({ page }, info) => {
  const recs = await openFocus(page);
  const markers = page.locator('.mk');
  await expect(markers).toHaveCount(6);
  await expect(page.locator('.mk--seed')).toHaveAttribute('data-album-id', '11');
  await expect(page.locator('.mk-n')).toHaveText(['1', '2', '3', '4', '5']);
  await expect(page.locator('svg.mk-lines line[data-to]')).toHaveCount(5);

  // (a) recommendation markers in list order, each with its own rank badge
  expect(await page.locator('.mk--rec').evaluateAll((els) => els.map((e) => Number((e as HTMLElement).dataset.albumId)))).toEqual(recs);
  for (const [i, id] of recs.entries()) await expect(page.locator(`.mk-n[data-for="${id}"]`)).toHaveText(String(i + 1));

  const boxes = await markers.evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: Number((e as HTMLElement).dataset.albumId), left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }),
  );
  const vp = page.viewportSize()!;
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(vp.width);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(vp.height);
  }
  // (b) no two marker boxes closer than the 10 px gap (less a little rounding)
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      const need = (boxes[a].w + boxes[b].w) / 2 + 10 - 1.5;
      const apart = Math.abs(boxes[a].cx - boxes[b].cx) >= need || Math.abs(boxes[a].cy - boxes[b].cy) >= need;
      expect(apart, `${boxes[a].id} and ${boxes[b].id}`).toBe(true);
    }
  }
  // (c) the seed cover sits on the seed album
  const seed = boxes.find((b) => b.id === 11)!;
  const seedPoint = (await page.evaluate(() => window.__rmr!.map!.screenPoint(11)))!;
  expect(Math.hypot(seed.cx - seedPoint.x, seed.cy - seedPoint.y)).toBeLessThan(40);
  // (d) each line runs from the seed cover's centre to its recommendation's cover centre
  const lines = await page.locator('svg.mk-lines line[data-to]').evaluateAll((els) => {
    const svg = (els[0] as SVGLineElement).ownerSVGElement!.getBoundingClientRect();
    return els.map((l) => ({
      to: Number(l.getAttribute('data-to')),
      x1: svg.left + Number(l.getAttribute('x1')),
      y1: svg.top + Number(l.getAttribute('y1')),
      x2: svg.left + Number(l.getAttribute('x2')),
      y2: svg.top + Number(l.getAttribute('y2')),
    }));
  });
  for (const l of lines) {
    const end = boxes.find((b) => b.id === l.to)!;
    expect(Math.abs(l.x1 - seed.cx), `line ${l.to} x1`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.y1 - seed.cy), `line ${l.to} y1`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.x2 - end.cx), `line ${l.to} x2`).toBeLessThanOrEqual(2);
    expect(Math.abs(l.y2 - end.cy), `line ${l.to} y2`).toBeLessThanOrEqual(2);
  }
  await shot(page, info, 'focus');
});

test('hot album is highlighted and a hovered marker shows its label', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer hover');
  const recs = await openFocus(page);
  await page.evaluate((id) => window.__rmr!.getState().setHot(id), recs[1]);
  await expect(page.locator(`.mk[data-album-id="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`svg.mk-lines line[data-to="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`.mk-n[data-for="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await page.evaluate(() => window.__rmr!.getState().setHot(null));
  // The markers take no pointer events: the canvas under them hit-tests their boxes.
  const p = await markerCentre(page, recs[2]);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator(`.mk[data-album-id="${recs[2]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`svg.mk-lines line[data-to="${recs[2]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator('canvas.map-canvas')).toHaveCSS('cursor', 'pointer');
  await expect(page.locator('.map-tip')).toHaveCSS('opacity', '1');
  await page.mouse.move(p.x + 200, 20);
  await expect(page.locator(`.mk[data-album-id="${recs[2]}"]`)).not.toHaveAttribute('data-hot', 'true');
});

test('clicking a marker picks its album', async ({ page, isMobile }) => {
  const recs = await openFocus(page);
  const p = await markerCentre(page, recs[3]);
  if (isMobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  // On /map a pick selects the album (in album view the same callback opens its page).
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).toBe(recs[3]);
});

test('a drag that starts on a cover pans the map', async ({ page, isMobile }) => {
  const recs = await openFocus(page);
  const before = await page.evaluate(() => window.__rmr!.map!.getCamera());
  const p = await markerCentre(page, recs[0]);
  if (isMobile) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', p.x, p.y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', p.x + i * 10, p.y + i * 6);
    await touch('touchEnd', p.x + 80, p.y + 48);
  } else {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 80, p.y + 48, { steps: 8 });
    await page.mouse.up();
  }
  await waitForCameraIdle(page);
  const after = await page.evaluate(() => window.__rmr!.map!.getCamera());
  expect(after.x).toBeLessThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
  // A drag is not a pick.
  expect(await page.evaluate(() => window.__rmr!.getState().selected)).toBeNull();
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

test('a zoom from the buttons survives a stop change until Reset re-arms the focus framing', async ({ page }) => {
  await openFocus(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  const zoomed = await camera(page);
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeCloseTo(zoomed.zoom, 6);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  const reset = await camera(page);
  expect(reset.zoom).toBeLessThan(zoomed.zoom);
  await page.evaluate(() => window.__rmr!.getState().setStop('sonic'));
  await waitForCameraIdle(page);
  const reframed = await camera(page);
  expect(Math.hypot(reframed.x - reset.x, reframed.y - reset.y) + Math.abs(reframed.zoom - reset.zoom)).toBeGreaterThan(1e-4);
});

test('the slider has 44 px tap targets on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('/map');
  await waitForMap(page);
  const targets = [page.getByRole('slider', { name: COPY.slider.label }), ...Object.values(COPY.slider.stops).map((n) => page.getByRole('button', { name: n, exact: true }))];
  for (const t of targets) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
