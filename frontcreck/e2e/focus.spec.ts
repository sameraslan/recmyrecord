import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { camera, shot, waitForCameraIdle, waitForGasSharpSettled, waitForMap } from './helpers';

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

type Pt = { x: number; y: number };

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
  // Every line is a dark casing under a white core, and all casings are drawn below all cores.
  await expect(page.locator('svg.mk-lines g.mk-case line[data-case]')).toHaveCount(5);
  expect(await page.locator('svg.mk-lines > g').evaluateAll((gs) => gs.map((g) => g.getAttribute('class')))).toEqual(['mk-case', 'mk-core']);
  // The j-th casing lies under the j-th core (MarkerDriver pairs the two groups by their order): the same album,
  // the same segment, and a leader's casing shown or hidden with its core. No casing among the cores or core
  // among the casings.
  const pairs = await page.locator('svg.mk-lines').evaluate((svg) => {
    const read = (l: Element) => {
      const d = (l as SVGLineElement).dataset;
      return {
        rec: d.to ?? d.case ?? null,
        leader: d.leader ?? d.leaderCase ?? null,
        role: d.to !== undefined || d.leader !== undefined ? 'core' : 'case',
        at: ['x1', 'y1', 'x2', 'y2'].map((k) => l.getAttribute(k)),
        display: (l as SVGLineElement).style.display,
      };
    };
    const [cases, cores] = [...svg.children].map((g) => [...g.children].map(read));
    return { cases, cores };
  });
  expect(pairs.cores.map((l) => l.role)).toEqual(Array(11).fill('core'));
  expect(pairs.cases.map((l) => l.role)).toEqual(Array(11).fill('case'));
  expect(pairs.cores.map((l) => l.rec).filter((id) => id !== null)).toEqual(recs.map(String));
  expect(pairs.cores.map((l) => l.leader).filter((id) => id !== null)).toEqual([11, ...recs].map(String));
  for (const [j, core] of pairs.cores.entries()) {
    const casing = pairs.cases[j];
    expect({ rec: casing.rec, leader: casing.leader }, `casing ${j} is its core's`).toEqual({ rec: core.rec, leader: core.leader });
    expect(casing.display, `casing ${j} shows with its core`).toBe(core.display);
    if (core.rec !== null) expect(core.at.every((v) => v !== null && Number.isFinite(Number(v))), `core ${j} is placed`).toBe(true);
    if (core.rec !== null || core.display !== 'none') expect(casing.at, `casing ${j} lies under its core`).toEqual(core.at);
  }

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
  // The map runs under the header, so "on screen" means below the header's bottom edge, not below y = 0.
  const headerBottom = await page.locator('header.top').evaluate((el) => el.getBoundingClientRect().bottom);
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(vp.width);
    expect(box.top).toBeGreaterThanOrEqual(headerBottom);
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
  // (d) each line runs from the edge of the seed's frame (4 px outside its cover) to the edge of its
  // recommendation's frame (1 px outside), along the straight line between the two centres, and at least
  // 23 px of it shows.
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
  const cheb = (x: number, y: number, b: { cx: number; cy: number }) => Math.max(Math.abs(x - b.cx), Math.abs(y - b.cy));
  for (const l of lines) {
    const end = boxes.find((b) => b.id === l.to)!;
    expect(Math.abs(cheb(l.x1, l.y1, seed) - (seed.w / 2 + 4)), `line ${l.to} starts on the seed frame`).toBeLessThanOrEqual(1.5);
    expect(Math.abs(cheb(l.x2, l.y2, end) - (end.w / 2 + 1)), `line ${l.to} ends on its cover's frame`).toBeLessThanOrEqual(1.5);
    // Collinear with the two centres: the cross product of (end - seed) and (point - seed) is near zero.
    const dx = end.cx - seed.cx;
    const dy = end.cy - seed.cy;
    const len = Math.hypot(dx, dy);
    for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]]) expect(Math.abs(dx * (y - seed.cy) - dy * (x - seed.cx)) / len, `line ${l.to} aims at the centres`).toBeLessThanOrEqual(1.5);
    expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), `line ${l.to} shows`).toBeGreaterThanOrEqual(23);
  }
  await shot(page, info, 'focus');
});

test('hot album is highlighted and a hovered marker shows its label', async ({ page, isMobile }) => {
  test.skip(isMobile, 'pointer hover');
  const recs = await openFocus(page);
  await page.evaluate((id) => window.__rmr!.getState().setHot(id), recs[1]);
  await expect(page.locator(`.mk[data-album-id="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`svg.mk-lines line[data-to="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`svg.mk-lines g.mk-case line[data-case="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`.mk-n[data-for="${recs[1]}"]`)).toHaveAttribute('data-hot', 'true');
  await page.evaluate(() => window.__rmr!.getState().setHot(null));
  // The markers take no pointer events: the canvas under them hit-tests their boxes.
  const p = await markerCentre(page, recs[2]);
  await page.mouse.move(p.x, p.y);
  await expect(page.locator(`.mk[data-album-id="${recs[2]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`svg.mk-lines line[data-to="${recs[2]}"]`)).toHaveAttribute('data-hot', 'true');
  await expect(page.locator(`svg.mk-lines g.mk-case line[data-case="${recs[2]}"]`)).toHaveAttribute('data-hot', 'true');
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
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  // Frame by frame: record album 11 and isAnimating() on every animation frame from the stop change until it settles.
  const run = await page.evaluate(
    () =>
      new Promise<{ before: Pt | null; f0: number; log: { f: number; p: Pt | null; a: boolean }[] }>((resolve) => {
        const rmr = window.__rmr!;
        const api = rmr.map!;
        const before = api.screenPoint(11);
        const f0 = rmr.frames ?? 0;
        const log: { f: number; p: Pt | null; a: boolean }[] = [];
        const tick = () => {
          log.push({ f: rmr.frames ?? 0, p: api.screenPoint(11), a: api.isAnimating() });
          if (!log[log.length - 1].a || log.length > 240) resolve({ before, f0, log });
          else requestAnimationFrame(tick);
        };
        rmr.getState().setStop('sonic');
        requestAnimationFrame(tick);
      }),
  );
  const before = run.before;
  expect(before, 'album 11 on screen before').not.toBeNull();
  for (const e of run.log) expect(e.p, `album 11 on screen at frame ${e.f}`).not.toBeNull();
  const last = run.log[run.log.length - 1];
  expect(last.a, 'settled').toBe(false);
  expect(last.f - run.f0, 'rendered frames to settle').toBeLessThanOrEqual(3);
  // The morph really happened, at once: album 11 moved, and every frame shows it at the old or the sonic position.
  const d = (p: Pt | null, q: Pt | null) => Math.hypot(p!.x - q!.x, p!.y - q!.y);
  expect(d(last.p, before)).toBeGreaterThan(1);
  for (const e of run.log) expect(Math.min(d(e.p, before), d(e.p, last.p)), `frame ${e.f}`).toBeLessThan(0.5);
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
  // Reset drops the manual zoom for the focus framing at the current stop, which can be wider or tighter.
  expect(Math.abs(reset.zoom - zoomed.zoom)).toBeGreaterThan(1e-3);
  await page.evaluate(() => window.__rmr!.getState().setStop('sonic'));
  await waitForCameraIdle(page);
  const reframed = await camera(page);
  expect(Math.hypot(reframed.x - reset.x, reframed.y - reset.y) + Math.abs(reframed.zoom - reset.zoom)).toBeGreaterThan(1e-4);
});

test('the slider has 44 px tap targets on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('/map');
  await waitForMap(page);
  const range = page.getByRole('slider', { name: COPY.slider.label });
  const buttons = Object.values(COPY.slider.stops).map((n) => page.getByRole('button', { name: n, exact: true }));
  // Every point of each 44 px band down the target's centre line reaches that target, not a neighbour.
  for (const t of [range, ...buttons]) {
    const box = (await t.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    const misses = await t.evaluate((el, b) => {
      const out: number[] = [];
      const x = b.x + b.width / 2;
      for (let dy = 0.5; dy < 44; dy += 1) {
        const hit = document.elementFromPoint(x, b.y + dy);
        if (!hit || !(hit === el || el.contains(hit))) out.push(dy);
      }
      return out;
    }, box);
    expect(misses, await t.evaluate((el) => el.outerHTML.slice(0, 60))).toEqual([]);
  }
});

/** A focus that reaches the bottom edge: the lowest album on screen as the seed, with the albums closest to it
 * on screen (which the ring pushes around it) and the highest album (so the framing is limited vertically). */
async function bottomEdgeFocus(page: Page): Promise<{ seed: number; recs: number[] }> {
  return page.evaluate(() => {
    const api = window.__rmr!.map!;
    const pts: { id: number; x: number; y: number }[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      pts.push({ id, ...p });
    }
    const low = pts.reduce((a, b) => (b.y > a.y ? b : a));
    const high = pts.reduce((a, b) => (b.y < a.y ? b : a));
    const near = pts
      .filter((p) => p.id !== low.id && p.id !== high.id)
      .sort((a, b) => Math.hypot(a.x - low.x, a.y - low.y) - Math.hypot(b.x - low.x, b.y - low.y))
      .slice(0, 6)
      .map((p) => p.id);
    return { seed: low.id, recs: [...near, high.id] };
  });
}

test('on a phone the focus markers stay above the slider panel', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const focus = await bottomEdgeFocus(page);
  const cases = [focus, { seed: 11, recs: await recsOf(page, 11, 'balanced', 10) }];
  for (const f of cases) {
    await setFocus(page, f.seed, f.recs);
    await waitForCameraIdle(page);
    await expect(page.locator('.mk')).toHaveCount(f.recs.length + 1);
    const panelTop = (await page.locator('.mode').boundingBox())!.y;
    const bottoms = await page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
    for (const b of bottoms) expect(b, `seed ${f.seed}`).toBeLessThanOrEqual(panelTop);
  }
  // After the visitor moves the camera, the framing no longer helps: slide the albums down until the seed sits
  // behind the panel; the layout bounds still keep every marker above it.
  await setFocus(page, focus.seed, focus.recs);
  await waitForCameraIdle(page);
  const panelTop = (await page.locator('.mode').boundingBox())!.y;
  const seedY = (await page.evaluate((id) => window.__rmr!.map!.screenPoint(id), focus.seed))!.y;
  const shift = panelTop + 40 - seedY;
  await page.evaluate((dy) => window.__rmr!.map!.panBy(0, dy), shift);
  let moved = (await page.evaluate((id) => window.__rmr!.map!.screenPoint(id), focus.seed))!.y;
  if (moved < seedY) {
    await page.evaluate((dy) => window.__rmr!.map!.panBy(0, -2 * dy), shift);
    moved = (await page.evaluate((id) => window.__rmr!.map!.screenPoint(id), focus.seed))!.y;
  }
  expect(moved, 'the seed album is behind the panel').toBeGreaterThan(panelTop + 20);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bottoms = await page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  for (const b of bottoms) expect(b, 'after the camera moved').toBeLessThanOrEqual(panelTop);
});

test('on a phone a larger bottom inset still keeps markers and zoom controls above the slider panel', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const focus = await bottomEdgeFocus(page);
  // Stands in for env(safe-area-inset-bottom) on an iPhone with a home indicator (about 34 px). Safari changes
  // the inset when its toolbar collapses, and fires a window resize with it; so does this test.
  await page.addStyleTag({ content: '.mode { bottom: 46px !important; }' });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await setFocus(page, focus.seed, focus.recs);
  await waitForCameraIdle(page);
  await expect(page.locator('.mk')).toHaveCount(focus.recs.length + 1);
  const panelTop = (await page.locator('.mode').boundingBox())!.y;
  expect(panelTop).toBeLessThan(844 - 46 - 100);
  const bottoms = await page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  for (const b of bottoms) expect(b).toBeLessThanOrEqual(panelTop);
  const zoom = (await page.locator('.map-zoom').boundingBox())!;
  expect(zoom.y + zoom.height).toBeLessThanOrEqual(panelTop);
});

test('with an album open the map draws no frame at rest and its covers stay put', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await setFocus(page, 11, await recsOf(page, 11, 'balanced', 10));
  await waitForCameraIdle(page);
  await expect(page.locator('.mk')).toHaveCount(11);
  // Part 1's sharper gas image may fade in about a second after the map settles: the one bounded exception.
  await waitForGasSharpSettled(page);
  const where = () => page.locator('.mk').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform));
  const before = await where();
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1, 'frames drawn at rest with an album open').toBe(0);
  expect(await where()).toEqual(before);
});

test('a frame in which no cover moved writes nothing to the lines', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await setFocus(page, 11, await recsOf(page, 11, 'balanced', 10));
  await waitForCameraIdle(page);
  await expect(page.locator('.mk')).toHaveCount(11);
  await waitForGasSharpSettled(page);
  await page.evaluate(() => {
    const w = window as unknown as { __lineWrites: number };
    w.__lineWrites = 0;
    new MutationObserver((records) => (w.__lineWrites += records.length)).observe(document.querySelector('svg.mk-lines')!, { attributes: true, subtree: true });
  });
  const state = () => page.evaluate(() => ({ frames: window.__rmr!.frames ?? 0, writes: (window as unknown as { __lineWrites: number }).__lineWrites }));
  // Marking the seed "hot" changes nothing on screen (the seed is never drawn hot) but asks for a frame.
  const rest = await state();
  await page.evaluate(() => window.__rmr!.getState().setHot(11));
  await expect.poll(async () => (await state()).frames).toBeGreaterThan(rest.frames);
  await page.evaluate(() => window.__rmr!.getState().setHot(null));
  await page.waitForTimeout(300);
  const still = await state();
  expect(still.frames, 'frames drawn with nothing moved').toBeGreaterThan(rest.frames);
  expect(still.writes, 'attribute writes to the lines with nothing moved').toBe(0);
  // The observer does see the lines move: a zoom rewrites them, at most 8 attributes a line each frame (11 cores
  // and casings, two style writes where a leader appears or goes).
  await page.evaluate(() => window.__rmr!.map!.zoomBy(1.4));
  await waitForCameraIdle(page);
  const moved = await state();
  const frames = moved.frames - still.frames;
  const writes = moved.writes - still.writes;
  console.log(`line writes while zooming: ${writes} in ${frames} frames (${(writes / frames).toFixed(1)} a frame)`);
  expect(writes, 'the lines follow a zoom').toBeGreaterThan(0);
  expect(writes).toBeLessThanOrEqual((frames + 12) * (10 * 8 + 11 * 10));
});

test('after a zoom with an album open the covers settle on the fresh layout and the map rests', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await setFocus(page, 11, await recsOf(page, 11, 'balanced', 10));
  await waitForCameraIdle(page);
  await expect(page.locator('.mk')).toHaveCount(11);
  const canvas = page.locator('canvas.map-canvas');
  await canvas.focus();
  for (const key of ['+', '+', '-']) {
    await page.keyboard.press(key);
    await waitForCameraIdle(page);
  }
  // The covers ease onto the settled layout in the DOM; then the gas's sharper image may still fade in.
  await waitForGasSharpSettled(page);
  const settled = await page.evaluate(() => window.__rmr!.markerLayout!());
  expect(settled, 'a focus is open and no ease is running').not.toBeNull();
  expect(settled!.freshGap, 'px from a fresh layout of the view at rest').toBeLessThan(0.01);
  const box = (await canvas.boundingBox())!;
  for (const m of settled!.placed) {
    const r = (await page.locator(`.mk[data-album-id="${m.id}"]`).boundingBox())!;
    expect(Math.abs(r.x + r.width / 2 - box.x - m.x), `cover ${m.id} x`).toBeLessThan(0.6);
    expect(Math.abs(r.y + r.height / 2 - box.y - m.y), `cover ${m.id} y`).toBeLessThan(0.6);
  }
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1, 'frames drawn at rest after the settle').toBe(0);
});

test('an album opens with its covers laid out for the framed view: nothing eases when the framing lands', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await setFocus(page, 11, await recsOf(page, 11, 'balanced', 10));
  // The framing tween runs; its first frame lays out the view it lands on.
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForCameraIdle(page);
  await expect(page.locator('.mk')).toHaveCount(11);
  await page.waitForTimeout(400); // longer than an ease, had one run
  const open = await page.evaluate(() => window.__rmr!.markerLayout!());
  expect(open, 'a focus is open and no ease is running').not.toBeNull();
  expect(open!.eases, 'eases run since the album opened').toBe(0);
  expect(open!.freshGap, 'px from a fresh layout of the view at rest').toBeLessThan(0.01);
});

/** One row per animation frame while a zoom runs: how far the covers on screen are from the layout of the very
 * view on screen (`gap`, px; null while an ease moves them), the camera, and each cover's place. */
type CoverRow = { gap: number | null; cam: string; drawn: number; at: number[] };
type CoverWindow = Window & { __covers?: { rows: CoverRow[]; on: boolean } };

async function sampleCovers(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = ((window as CoverWindow).__covers = { rows: [] as CoverRow[], on: true });
    const tick = () => {
      const h = window.__rmr!.markerLayout?.() ?? null;
      const c = window.__rmr!.map!.getCamera();
      const at: number[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('.mk')) {
        const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform);
        const w = parseFloat(el.style.width);
        at.push(m ? Number(m[1]) + w / 2 : NaN, m ? Number(m[2]) + w / 2 : NaN);
      }
      s.rows.push({ gap: h ? h.freshGap : null, cam: `${c.x},${c.y},${c.zoom}`, drawn: window.__rmr!.frames ?? 0, at });
      if (s.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Samples within which the frame that draws a camera move is due after the sample that saw the move. */
const ARRIVES_WITHIN = 3;

/** Stops the sampler and reports what the owner's eye sees: the covers behind the map while it zooms (`behind`,
 * the largest gap in px on a frame where the camera moved), frames where an ease was moving them (`easing`), and
 * how far any cover still moves once the map has drawn the view the camera stopped at (`after`, px, and
 * `afterFrames`). A pinch moves the camera in its pointer event and the map draws it on the next frame, covers
 * and stars together: that one frame is the view arriving, not a cover catching up, so `after` counts from it.
 * A frame counter that moved since the sample before does not show that frame has been drawn: a pinch step is
 * two pointer events, and a frame that lands between them moves the counter for the first finger while the
 * second finger's move is still to be drawn. So the view has arrived at the first frame drawn after the sample
 * that saw the camera's last move. It is due on the very next frame; `ARRIVES_WITHIN` samples are allowed, and a
 * frame drawn later than that (a settle as the fingers lift, an ease) is counted as movement after the stop. */
async function coverLag(page: Page) {
  const rows = await page.evaluate(() => {
    const s = (window as CoverWindow).__covers!;
    s.on = false;
    return s.rows;
  });
  let moving = 0;
  let behind = 0;
  let easing = 0;
  let last = 0;
  for (let k = 1; k < rows.length; k++) {
    if (rows[k].gap === null) easing++;
    if (rows[k].cam === rows[k - 1].cam) continue;
    moving++;
    last = k;
    behind = Math.max(behind, rows[k].gap ?? Infinity);
  }
  // The first sample at which the map has drawn the camera's last move: the first frame drawn after the sample
  // that saw it, or that sample itself when no frame follows (the move had been drawn by then).
  let shown = last;
  for (let k = last + 1; k < rows.length && k <= last + ARRIVES_WITHIN; k++) {
    if (rows[k].drawn > rows[last].drawn) {
      shown = k;
      break;
    }
  }
  let after = 0;
  let afterFrames = 0;
  for (let k = shown + 1; k < rows.length; k++) {
    const d = Math.max(...rows[k].at.map((v, i) => Math.abs(v - rows[shown].at[i])));
    after = Math.max(after, d);
    if (Math.max(...rows[k].at.map((v, i) => Math.abs(v - rows[k - 1].at[i]))) > 0.05) afterFrames++;
  }
  return { frames: rows.length, moving, behind, easing, after, afterFrames, framesAfterStop: rows.length - 1 - shown };
}

// The site before the Trifid theme laid the covers out on every drawn frame. The theme first carried them rigidly
// through a zoom and laid them out once it had ended, easing them over: they lagged behind the hand and then
// caught up. Five recommendations, as an album opens, and ten.
for (const n of [5, 10]) {
  test(`a wheel zoom with an album open keeps every cover in its place for the view on screen, frame by frame, and nothing moves once it stops (${n} recommendations)`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse wheel');
    await page.goto('/map');
    await waitForMap(page);
    await setFocus(page, 11, await recsOf(page, 11, 'balanced', n));
    await waitForCameraIdle(page);
    await expect(page.locator('.mk')).toHaveCount(n + 1);
    const box = (await page.locator('canvas.map-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.waitForTimeout(300);
    const before = (await page.evaluate(() => window.__rmr!.markerLayout!()))!;
    await sampleCovers(page);
    // Notches a hand's pace apart, out and back in, then a run of small steps as a trackpad sends them.
    for (const dy of [150, 150, 150, -150, -150, -150]) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(260);
    }
    for (let i = 0; i < 30; i++) {
      await page.mouse.wheel(0, i < 15 ? 14 : -14);
      await page.waitForTimeout(16);
    }
    await waitForCameraIdle(page);
    await page.waitForTimeout(500);
    const lag = await coverLag(page);
    const after = (await page.evaluate(() => window.__rmr!.markerLayout!()))!;
    console.log(`wheel zoom, ${n} recs: ${JSON.stringify(lag)}`);
    expect(lag.moving, 'frames on which the camera moved').toBeGreaterThan(30);
    expect(lag.framesAfterStop, 'frames watched after the zoom stopped').toBeGreaterThan(10);
    expect(lag.behind, 'px a cover was from its place for the view on screen, on a frame of the zoom').toBeLessThan(1);
    expect(lag.easing, 'frames on which covers were easing over').toBe(0);
    expect(after.eases - before.eases, 'eases run').toBe(0);
    expect(lag.after, 'px a cover moved after the camera had stopped').toBeLessThan(0.5);
    expect(after.freshGap, 'px from a fresh layout of the view at rest').toBeLessThan(0.01);
  });
}

test('a pinch with an album open keeps every cover in its place for the view on screen, frame by frame, with nothing to catch up on after the fingers lift', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a two-finger pinch is a touch gesture');
  await page.goto('/map');
  await waitForMap(page);
  await setFocus(page, 11, await recsOf(page, 11, 'balanced', 5));
  await waitForCameraIdle(page);
  await waitForGasSharpSettled(page);
  const canvas = page.locator('canvas.map-canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.35;
  // Synthetic touch pointers: the canvas captures pointers, which needs a real pointer behind it.
  await canvas.evaluate((c: HTMLCanvasElement) => {
    c.setPointerCapture = () => {};
    c.hasPointerCapture = () => false;
    c.releasePointerCapture = () => {};
  });
  const touch = (type: string, id: number, x: number) =>
    canvas.evaluate(
      (c, [type, id, x, y]) => c.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: 'touch', clientX: x as number, clientY: y as number, bubbles: true, isPrimary: id === 1, button: 0, buttons: 1 })),
      [type, id, x, cy] as const,
    );
  const before = (await page.evaluate(() => window.__rmr!.markerLayout!()))!;
  const z0 = (await camera(page)).zoom;
  const f0 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await sampleCovers(page);
  await touch('pointerdown', 1, cx - 40);
  await touch('pointerdown', 2, cx + 40);
  for (let i = 1; i <= 20; i++) {
    await touch('pointermove', 1, cx - 40 - i * 5);
    await touch('pointermove', 2, cx + 40 + i * 5);
    await page.waitForTimeout(60);
  }
  const pinchFrames = (await page.evaluate(() => window.__rmr!.frames ?? 0)) - f0;
  expect(pinchFrames, 'the pinch drew frames').toBeGreaterThan(10);
  const during = await page.evaluate(() => window.__rmr!.markerLayout!());
  expect(during, 'no ease runs during the pinch').not.toBeNull();
  expect(during!.freshGap, 'px from the layout of the view on screen, fingers still down').toBeLessThan(1);
  await touch('pointerup', 1, cx - 140);
  await touch('pointerup', 2, cx + 140);
  await waitForCameraIdle(page);
  await page.waitForTimeout(400);
  const lag = await coverLag(page);
  const after = (await page.evaluate(() => window.__rmr!.markerLayout!()))!;
  console.log(`pinch: ${JSON.stringify(lag)}`);
  expect((await camera(page)).zoom, 'the pinch zoomed in').toBeGreaterThan(z0 * 1.5);
  expect(lag.moving, 'frames on which the camera moved').toBeGreaterThan(10);
  expect(lag.behind, 'px a cover was from its place for the view on screen, on a frame of the pinch').toBeLessThan(1);
  expect(lag.easing, 'frames on which covers were easing over').toBe(0);
  expect(lag.after, 'px a cover moved after the camera had stopped').toBeLessThan(0.5);
  expect(after.settles - before.settles, 'settles for the whole pinch').toBeLessThanOrEqual(1);
  expect(after.eases - before.eases, 'eases for the whole pinch').toBe(0);
  expect(after.freshGap, 'px from a fresh layout of the view at rest').toBeLessThan(0.01);
});

test('a wheel zoom with an album open draws no frame after it ends', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse wheel');
  await page.goto('/map');
  await waitForMap(page);
  await setFocus(page, 11, await recsOf(page, 11, 'balanced', 10));
  await waitForCameraIdle(page);
  await waitForGasSharpSettled(page);
  const box = (await page.locator('canvas.map-canvas').boundingBox())!;
  const extra: number[] = [];
  for (let r = 0; r < 4; r++) {
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    // Frames drawn in the 400 ms after the frame where the zoom easing ends (isAnimating turns false).
    const after = page.evaluate(
      () =>
        new Promise<number>((done) => {
          let seen = false;
          const tick = () => {
            const moving = window.__rmr!.map!.isAnimating();
            if (moving) seen = true;
            if (seen && !moving) {
              const at = window.__rmr!.frames ?? 0;
              setTimeout(() => done((window.__rmr!.frames ?? 0) - at), 400);
              return;
            }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.mouse.wheel(0, r % 2 ? 150 : -150);
    extra.push(await after);
    await waitForCameraIdle(page);
  }
  expect(extra, 'frames after each wheel zoom ended').toEqual([0, 0, 0, 0]);
  const rest = (await page.evaluate(() => window.__rmr!.markerLayout!()))!;
  expect(rest.freshGap).toBeLessThan(0.01);
});
