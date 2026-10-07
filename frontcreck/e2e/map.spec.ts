import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { albumSpread, camera, coversSettled, isPhone, mapFrames, shot, twinkleOff, visibleAlbumPoint, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet, wholeMapMiss } from './helpers';

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
  await page.waitForTimeout(1200); // nothing should happen: the idle window in which the map must not draw
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
  await waitForMapQuiet(page, 300); // covers have loaded and faded in
  await shot(page, info, 'explore-zoomed');
});

test('keyboard pans and zooms, 0 gives the whole map', async ({ page }, info) => {
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
  // The map opens at the Overview (Task 0); 0 is the fit button, which gives the whole map.
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  const again = await camera(page);
  expect(Math.hypot(again.x - whole.x, again.y - whole.y) + Math.abs(again.zoom - whole.zoom)).toBeLessThan(1e-6);
});

test('zoom buttons work', async ({ page }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  const again = await camera(page);
  expect(Math.hypot(again.x - whole.x, again.y - whole.y) + Math.abs(again.zoom - whole.zoom)).toBeLessThan(1e-6);
});

test('the zoom corner is one closed stack of three buttons: zoom in, zoom out, whole map, and nothing above them', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const side = isMobile ? 44 : 40;
  const corner = page.locator('.map-zoom');
  await expect(corner.locator('> *')).toHaveCount(3);
  expect(await corner.locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([COPY.map.zoomIn, COPY.map.zoomOut, COPY.map.reset]);
  const boxes = await corner.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
  for (const b of boxes) expect([b.w, b.h]).toEqual([side, side]);
  // Each starts where the one above it ends, and the corner is exactly the three of them tall.
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].y - (boxes[i - 1].y + boxes[i - 1].h)).toBeCloseTo(0, 1);
  const box = (await corner.boundingBox())!;
  expect(box.y).toBeCloseTo(boxes[0].y, 1);
  expect(box.height).toBeCloseTo(3 * side, 1);
});

test.describe('desktop pointer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('a pointer move over empty map draws one frame, a move onto an album at most three, and neither touches the zoom corner', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    // The sharper gas image may fade in about a second after the map settles, and a glint is a timer: neither
    // may draw or write while the moves are counted.
    await waitForGasSharpSettled(page);
    await twinkleOff(page);
    // Twenty albums across the map, clear of the controls, and twenty-one points with no album within 12 px.
    const albums = await page.evaluate(() => {
      const api = window.__rmr!.map!;
      const out: { x: number; y: number }[] = [];
      for (let id = 0; out.length < 20; id += 37) {
        const p = api.screenPoint(id);
        if (!p) break;
        if (p.x < 320 || p.y < 240 || p.x > innerWidth - 140 || p.y > innerHeight - 140) continue;
        if (document.elementFromPoint(p.x, p.y)?.classList.contains('map-canvas')) out.push({ x: Math.round(p.x), y: Math.round(p.y) });
      }
      return out;
    });
    expect(albums.length).toBe(20);
    const free = await page.evaluate(() => {
      const api = window.__rmr!.map!;
      const pts: { x: number; y: number }[] = [];
      for (let id = 0; ; id++) {
        const p = api.screenPoint(id);
        if (!p) break;
        pts.push(p);
      }
      const open: { x: number; y: number; d: number }[] = [];
      for (let y = 220; y <= innerHeight - 220; y += 10) {
        for (let x = 320; x <= innerWidth - 320; x += 10) {
          let d = Infinity;
          for (const p of pts) {
            d = Math.min(d, Math.max(Math.abs(p.x - x), Math.abs(p.y - y)));
            if (d < 12) break;
          }
          if (d >= 12 && document.elementFromPoint(x, y)?.classList.contains('map-canvas')) open.push({ x, y, d });
        }
      }
      open.sort((p, q) => q.d - p.d || p.y - q.y || p.x - q.x);
      const out: { x: number; y: number }[] = [];
      for (const f of open) {
        if (out.length >= 21) break;
        if (out.every((o) => Math.max(Math.abs(o.x - f.x), Math.abs(o.y - f.y)) >= 40)) out.push({ x: f.x, y: f.y });
      }
      return out;
    });
    expect(free.length, 'points with no album within 12 px').toBe(21);
    /** Walks a path, one move at a time, each left to settle: the frames each move drew, and after how many of
     * the moves an album was hovered (the canvas shows the pointer cursor). */
    const walk = async (path: { x: number; y: number }[]): Promise<{ frames: number[]; hovers: number }> => {
      // From a point that hovers nothing, so the first move ends no hover either.
      await page.mouse.move(free[20].x, free[20].y);
      await waitForMapQuiet(page, 200);
      const frames: number[] = [];
      let hovers = 0;
      for (const p of path) {
        const f = await mapFrames(page);
        await page.mouse.move(p.x, p.y);
        await waitForMapQuiet(page, 200, { since: f });
        frames.push((await mapFrames(page)) - f);
        if (await page.evaluate(() => document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!.style.cursor === 'pointer')) hovers += 1;
      }
      return { frames, hovers };
    };
    await page.evaluate(() => {
      const w = window as unknown as { __cornerChanges: number };
      w.__cornerChanges = 0;
      new MutationObserver((r) => (w.__cornerChanges += r.length)).observe(document.querySelector('.map-zoom')!, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    // Over albums the hover changes with every move. How many frames a hover draws depends on whether its 80 ms
    // label timer falls into a frame already asked for, so those are bounded: the move, the change of hover, the label.
    const over = await walk(albums);
    expect(over.hovers, 'moves that ended on an album').toBeGreaterThan(5);
    for (const n of over.frames) expect(n, `frames for a move onto an album (${over.frames.join(', ')})`).toBeLessThanOrEqual(3);
    // Over empty map a move changes no hover: one frame, the pointer's.
    const empty = await walk(free.slice(0, 20));
    expect(empty.hovers, 'moves over empty map that hovered an album').toBe(0);
    expect(empty.frames, 'frames per pointer move over empty map').toEqual(free.slice(0, 20).map(() => 1));
    expect(await page.evaluate(() => (window as unknown as { __cornerChanges: number }).__cornerChanges), 'changes in the zoom corner over 40 pointer moves').toBe(0);
  });

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
    // Covers show after the fly: the shader draws the pick large and framed (explore.spec), not the DOM ring.
    await expect(page.locator('.map-sel')).toHaveCSS('opacity', '0');
    // Back among dots, the ring with its centre dot marks it.
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: COPY.map.zoomOut }).click();
    await waitForCameraIdle(page);
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
