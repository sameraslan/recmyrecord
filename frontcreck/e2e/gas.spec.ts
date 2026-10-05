import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { isPhone, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap, waitForMapQuiet } from './helpers';

/** In Rainbows in albums.json: near the middle of every layout, where the gas is dense. */
const IN_RAINBOWS = 11;
/** Luma of the empty sky, rgb(6, 6, 9). The old brown pane, #17120e, is about 19. */
const SKY_LUMA = 6.2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Luma at quantile q of a client-px rectangle of the screenshot. The median reads the background between album
 * dots and covers, which is the gas. */
async function lumaAt(page: Page, r: Rect, q = 0.5): Promise<number> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rect, quantile]) => {
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
      const lumas: number[] = [];
      for (let i = 0; i < d.length; i += 4) lumas.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      lumas.sort((a, b) => a - b);
      return lumas[Math.floor((lumas.length - 1) * quantile)];
    },
    [png, r, q] as const,
  );
}

/** A square of client px centred `offset` away from an album's point on screen. */
async function patchAt(page: Page, id: number, offset: readonly [number, number], size: number): Promise<Rect> {
  const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), id))!;
  return { x: p.x + offset[0] - size / 2, y: p.y + offset[1] - size / 2, w: size, h: size };
}

/** True when the centre and the four corners of the rectangle are on the map canvas (no marker, panel or button there). */
async function onCanvas(page: Page, r: Rect): Promise<boolean> {
  return page.evaluate(
    (q) =>
      [[0.5, 0.5], [0, 0], [1, 0], [0, 1], [1, 1]].every(([fx, fy]) => {
        const x = q.x + q.w * fx;
        const y = q.y + q.h * fy;
        return x > 0 && y > 0 && x < innerWidth && y < innerHeight && !!document.elementFromPoint(x, y)?.classList.contains('map-canvas');
      }),
    r,
  );
}

/** Offsets tried, in order, for a patch of bare map beside an open album: inside its pool, clear of its markers. */
const BESIDE: readonly (readonly [number, number])[] = [[200, 0], [-200, 0], [0, -180], [0, 180], [260, 0], [-260, 0]];

/** The point on the canvas that is furthest from every album (in the larger of its x and y distances), if that
 * is at least `clearance` client px: bare gas with no cover near it. Kept 140 px inside the top and bottom of
 * the window and 100 px inside its sides, away from the header and the controls. */
async function barePoint(page: Page, clearance: number): Promise<{ x: number; y: number } | null> {
  return page.evaluate((need) => {
    const api = window.__rmr!.map!;
    const pts: { x: number; y: number }[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      if (p.x > -need && p.y > -need && p.x < innerWidth + need && p.y < innerHeight + need) pts.push(p);
    }
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = 140; y <= innerHeight - 140; y += 12) {
      for (let x = 100; x <= innerWidth - 100; x += 12) {
        let d = Infinity;
        for (const p of pts) {
          d = Math.min(d, Math.max(Math.abs(p.x - x), Math.abs(p.y - y)));
          if (d < need) break;
        }
        if (d < need || (best && d <= best.d)) continue;
        if (document.elementFromPoint(x, y)?.classList.contains('map-canvas')) best = { x, y, d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }, clearance);
}

/** Counts the uploads of baked gas images (the only 2048 px ImageBitmaps the page hands to WebGL) and when
 * each happened. Call before page.goto. */
async function countGasUploads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __gasUploads: number; __gasUploadAt: number[] };
    w.__gasUploads = 0;
    w.__gasUploadAt = [];
    const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const fn of ['texImage2D', 'texSubImage2D']) {
      const orig = P[fn];
      P[fn] = function (this: unknown, ...a: unknown[]) {
        const src = a[a.length - 1];
        if (src instanceof ImageBitmap && src.width === 2048) {
          w.__gasUploads += 1;
          w.__gasUploadAt.push(performance.now());
        }
        return orig.apply(this, a);
      };
    }
  });
}
const gasUploads = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __gasUploads: number }).__gasUploads);

/** Holds the two late stops' images back until the returned function is called; resolves `arrived()` to how many
 * of them have reached the page. */
async function holdLateGas(page: Page): Promise<{ release: () => void; arrived: () => number }> {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const late = /\/data\/theme\/gas-(sonic|mood)\.webp$/;
  await page.route(late, async (route) => {
    await held;
    await route.continue();
  });
  let n = 0;
  page.on('requestfinished', (r) => {
    if (late.test(r.url())) n += 1;
  });
  return { release, arrived: () => n };
}

/** Starts input that goes on until `window.__busy.stop` is set: a drag on the map ('drag': one pointer move per
 * frame with the button down, so the map draws every frame) or a pointer wandering over the page header ('move':
 * input with no map frame). */
async function keepBusy(page: Page, kind: 'drag' | 'move'): Promise<void> {
  await page.evaluate((how) => {
    const w = window as unknown as { __busy: { stop: boolean; done: Promise<void> } };
    const c = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const fire = (el: Element, t: string, x: number, y: number) =>
      el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
    const state = { stop: false, done: Promise.resolve() };
    w.__busy = state;
    state.done = (async () => {
      if (how === 'drag') fire(c, 'pointerdown', cx, cy);
      const t0 = performance.now();
      while (!state.stop) {
        const k = (performance.now() - t0) / 2000;
        if (how === 'drag') fire(c, 'pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
        else fire(document.body, 'pointermove', 300 + Math.sin(k * 6.28) * 100, 20);
        await new Promise((res) => requestAnimationFrame(res));
      }
      if (how === 'drag') fire(c, 'pointerup', cx, cy);
    })();
  }, kind);
}
const stopBusy = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    const b = (window as unknown as { __busy: { stop: boolean; done: Promise<void> } }).__busy;
    b.stop = true;
    await b.done;
  });

test('the gas is drawn behind the albums at the overview, and nothing draws at rest', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const requested: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/theme/')) requested.push(new URL(r.url()).pathname);
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  // polled: the other two stops are fetched in an idle slot, so their requests must not be raced
  await expect.poll(() => [...requested].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/gas-mood.webp', '/data/theme/gas-sonic.webp', '/data/theme/theme.json']);
  expect(await lumaAt(page, await patchAt(page, IN_RAINBOWS, [0, 0], 80))).toBeGreaterThan(SKY_LUMA * 3);
  expect(await page.evaluate(() => window.__rmr!.gasPool)).toBe(0);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200); // the idle window: with every texture in, the map must not draw
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1).toBeLessThanOrEqual(1);
});

test('the gas dims around an open album and comes back when it closes', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gasPool)).toBe(1);
  const zoom = (await page.evaluate(() => window.__rmr!.map!.getCamera())).zoom;
  // A patch of bare map beside the album; the same patch of the map is read again once the album is closed.
  let offset: readonly [number, number] | null = null;
  for (const o of BESIDE) {
    if (await onCanvas(page, await patchAt(page, IN_RAINBOWS, o, 120))) {
      offset = o;
      break;
    }
  }
  expect(offset, 'a patch of bare map beside the open album').not.toBeNull();
  const dimmed = await lumaAt(page, await patchAt(page, IN_RAINBOWS, offset!, 120));
  await page.getByRole('button', { name: COPY.map.exploreHere }).click();
  await expect(page).toHaveURL(/\/map$/);
  await waitForCameraIdle(page);
  await page.evaluate((z) => {
    const api = window.__rmr!.map!;
    const cam = api.getCamera();
    if (Math.abs(cam.zoom - z) > 1e-3) api.setCamera({ ...cam, zoom: z }, false);
  }, zoom);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gasPool)).toBe(0);
  const closed = await patchAt(page, IN_RAINBOWS, offset!, 120);
  expect(await onCanvas(page, closed), 'the same patch is on the map after the album closes').toBe(true);
  const plain = await lumaAt(page, closed);
  expect(plain, 'the sampled patch must show gas').toBeGreaterThan(SKY_LUMA + 4);
  expect(dimmed - SKY_LUMA).toBeLessThan((plain - SKY_LUMA) * 0.85);
});

test('past 32 px covers the gas fades on to a faint remnant at full-size covers', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  // flyTo centres the album and zooms until covers are 32 px: the end of the bands, where deep zoom starts.
  await page.evaluate((id) => window.__rmr!.map!.flyTo(id), IN_RAINBOWS);
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForCameraIdle(page);
  const at32 = await page.evaluate(() => window.__rmr!.map!.getCamera());
  // (rounding may leave the cover a hair past 32 px, so this is "about 0", not exactly 0; gasDeep is written in
  // the frame a camera change asks for, so it is polled: waitForMapQuiet can return before that frame is drawn)
  await expect.poll(() => page.evaluate(() => window.__rmr!.gasDeep)).toBeLessThan(0.001);
  // Twice the zoom: 64 px covers, past the 56 px where the fade ends.
  await page.evaluate((c) => window.__rmr!.map!.setCamera({ ...c, zoom: c.zoom * 2 }, false), at32);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  await expect.poll(() => page.evaluate(() => window.__rmr!.gasDeep)).toBe(1);
  await shot(page, info, 'gas-deep');
  // A point of bare gas: 60 px clear of every album here, so 30 px clear at half the zoom, where covers are 32 px.
  const bare = await barePoint(page, 60);
  expect(bare, 'a point of bare map at full zoom').not.toBeNull();
  const seed64 = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  const deep = await lumaAt(page, { x: bare!.x - 8, y: bare!.y - 8, w: 16, h: 16 });
  // The same point of the map with 32 px covers: half as far from the album on screen.
  await page.evaluate((c) => window.__rmr!.map!.setCamera(c, false), at32);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  await expect.poll(() => page.evaluate(() => window.__rmr!.gasDeep)).toBeLessThan(0.001);
  const seed32 = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), IN_RAINBOWS))!;
  const same = { x: seed32.x + (bare!.x - seed64.x) / 2 - 8, y: seed32.y + (bare!.y - seed64.y) / 2 - 8, w: 16, h: 16 };
  expect(await onCanvas(page, same), 'the same point is on the map at 32 px covers').toBe(true);
  const mid = await lumaAt(page, same);
  expect(mid, 'the sampled point must show gas at 32 px covers').toBeGreaterThan(SKY_LUMA + 4);
  // Strength 0.06 against 0.3 leaves about a fifth of the light; the old floor of 0.3 would leave all of it.
  expect(deep - SKY_LUMA).toBeLessThan((mid - SKY_LUMA) * 0.6);
  expect(deep, 'a faint remnant, not a hole in the sky').toBeGreaterThan(SKY_LUMA - 2);
});

test('moving the slider to a stop whose gas has not arrived keeps gas on screen, draws nothing at rest and breaks nothing', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/data/theme/gas-mood.webp', async (route) => {
    await held;
    await route.continue();
  });
  const balanced = page.waitForResponse((r) => r.url().endsWith('/data/theme/gas-balanced.webp') && r.ok());
  await page.goto('/map');
  await balanced;
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20_000 });
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('loading');
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForMapQuiet(page, 300);
  const vp = page.viewportSize()!;
  const middle = { x: vp.width / 2 - 150, y: vp.height / 2 - 150, w: 300, h: 300 };
  // the Balanced gas stands in while the Mood texture is held back: no blank frame
  expect(await lumaAt(page, middle)).toBeGreaterThan(SKY_LUMA * 2);
  // and no redraw loop while it waits: the frame counter stops
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('loading');
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1, 'frames drawn while the stand-in stop shows').toBeLessThanOrEqual(1);
  release();
  await waitForMap(page);
  await waitForMapQuiet(page, 300);
  expect(await lumaAt(page, middle)).toBeGreaterThan(SKY_LUMA * 2);
  expect(errors).toEqual([]);
});

test('gas images that arrive during a drag are not uploaded until the map is left alone', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const late = /\/data\/theme\/gas-(sonic|mood)\.webp$/;
  await page.route(late, async (route) => {
    await held;
    await route.continue();
  });
  let arrived = 0;
  page.on('requestfinished', (r) => {
    if (late.test(r.url())) arrived += 1;
  });
  await countGasUploads(page);
  const uploads = () => gasUploads(page);
  await page.goto('/map');
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'loading', null, { timeout: 20_000 });
  await waitForMapQuiet(page, 300);
  expect(await uploads(), 'only the stop on screen is uploaded so far').toBe(1);
  // A drag that goes on until told to stop: one pointer move per frame, as a hand on the map makes.
  await page.evaluate(() => {
    const w = window as unknown as { __drag: { stop: boolean; flagAtEnd: string | undefined; uploadsAtEnd: number; done: Promise<void> }; __gasUploads: number };
    const c = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const fire = (t: string, x: number, y: number) =>
      c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y }));
    const state = { stop: false, flagAtEnd: undefined as string | undefined, uploadsAtEnd: -1, done: Promise.resolve() };
    w.__drag = state;
    state.done = (async () => {
      fire('pointerdown', cx, cy);
      const t0 = performance.now();
      while (!state.stop) {
        const k = (performance.now() - t0) / 2000;
        fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
        await new Promise((res) => requestAnimationFrame(res));
      }
      state.flagAtEnd = window.__rmr!.gas;
      state.uploadsAtEnd = w.__gasUploads;
      fire('pointerup', cx, cy);
    })();
  });
  release();
  await expect.poll(() => arrived).toBe(2);
  // Both images are in and decoded well within this second, and the drag is still going: they must wait.
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('loading');
  const atEnd = await page.evaluate(async () => {
    const d = (window as unknown as { __drag: { stop: boolean; flagAtEnd: string | undefined; uploadsAtEnd: number; done: Promise<void> } }).__drag;
    d.stop = true;
    await d.done;
    return { flag: d.flagAtEnd, uploads: d.uploadsAtEnd };
  });
  // in the last frame of the drag: still waiting, and neither image has been uploaded
  expect(atEnd).toEqual({ flag: 'loading', uploads: 1 });
  // Left alone, the map takes them in, one per quiet moment, and then draws nothing.
  await waitForMap(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  expect(await uploads()).toBe(3);
  await waitForMapQuiet(page, 300);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBeLessThanOrEqual(1);
  // and the stops they belong to draw: the slider reaches Mood with gas on screen
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForMapQuiet(page, 300);
  const vp = page.viewportSize()!;
  expect(await lumaAt(page, { x: vp.width / 2 - 150, y: vp.height / 2 - 150, w: 300, h: 300 })).toBeGreaterThan(SKY_LUMA * 2);
  expect(errors).toEqual([]);
});

test('a slider move uploads only the waiting images its morph shows, after the click, and never a blank frame', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const late = await holdLateGas(page);
  await countGasUploads(page);
  await page.goto('/map');
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'loading', null, { timeout: 20_000 });
  await waitForMapQuiet(page, 300);
  // Both late images arrive while a drag keeps them waiting.
  await keepBusy(page, 'drag');
  late.release();
  await expect.poll(() => late.arrived()).toBe(2);
  await page.waitForTimeout(600);
  expect(await gasUploads(page)).toBe(1);
  // Balanced to Mood, with the drag still going. Nothing is uploaded inside the click itself.
  const inClick = await page.evaluate(() => {
    window.__rmr!.getState().setStop('mood');
    return (window as unknown as { __gasUploads: number }).__gasUploads;
  });
  expect(inClick, 'uploads when the click returns').toBe(1);
  // Mood goes in during the morph; Sonic, which this morph never shows, goes on waiting.
  await expect.poll(() => gasUploads(page)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await page.waitForTimeout(700);
  expect(await gasUploads(page), 'Sonic is not uploaded for a morph from Balanced to Mood').toBe(2);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('loading');
  const vp = page.viewportSize()!;
  // gas on screen at Mood (the stand-in or Mood itself: never the bare pane)
  expect(await lumaAt(page, { x: vp.width / 2 - 150, y: vp.height / 2 - 150, w: 300, h: 300 })).toBeGreaterThan(SKY_LUMA * 2);
  await stopBusy(page);
  await waitForMap(page);
  expect(await gasUploads(page)).toBe(3);
  expect(errors).toEqual([]);
});

test('a visitor who never stops moving still gets the late images, one at a time', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  test.setTimeout(60_000);
  const late = await holdLateGas(page);
  await countGasUploads(page);
  await page.goto('/map');
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'loading', null, { timeout: 20_000 });
  await waitForMapQuiet(page, 300);
  // A pointer that never rests (over the header, so the map itself draws nothing).
  await keepBusy(page, 'move');
  late.release();
  await expect.poll(() => late.arrived()).toBe(2);
  await page.waitForTimeout(2000);
  expect(await gasUploads(page), 'two seconds in, both still wait for a quiet moment').toBe(1);
  // After the longest wait they go in although the input never stopped, and not together.
  await expect.poll(() => gasUploads(page), { timeout: 15_000 }).toBe(3);
  await expect.poll(() => page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  const at = await page.evaluate(() => (window as unknown as { __gasUploadAt: number[] }).__gasUploadAt);
  expect(at[2] - at[1], 'ms between the two late uploads').toBeGreaterThan(3000);
  await stopBusy(page);
});

test('the gas comes back after the WebGL context is lost and restored', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const gasRequests: string[] = [];
  page.on('request', (r) => {
    if (/\/data\/theme\/gas-\w+\.webp$/.test(r.url())) gasRequests.push(new URL(r.url()).pathname);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const patch = await patchAt(page, IN_RAINBOWS, [0, 0], 80);
  const before = await lumaAt(page, patch);
  expect(before).toBeGreaterThan(SKY_LUMA * 3);
  expect([...gasRequests].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/gas-mood.webp', '/data/theme/gas-sonic.webp']);
  // The decoded images are freed once they are on the GPU, so a lost context takes the gas with it: the flag
  // must say so while the context is gone and right after it is back, until the images have been fetched again.
  const flags = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!;
    const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    const lostEvent = new Promise((resolve) => canvas.addEventListener('webglcontextlost', resolve, { once: true }));
    const restored = new Promise((resolve) => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
    lose.loseContext();
    await lostEvent;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const whileLost = window.__rmr!.gas;
    lose.restoreContext();
    await restored;
    return { whileLost, onRestore: window.__rmr!.gas };
  });
  expect(flags).toEqual({ whileLost: 'loading', onRestore: 'loading' });
  await waitForMap(page);
  await waitForMapQuiet(page, 300);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('ok');
  // every stop was fetched a second time (from the HTTP cache), and the same patch of gas is back
  expect([...gasRequests].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/gas-balanced.webp', '/data/theme/gas-mood.webp', '/data/theme/gas-mood.webp', '/data/theme/gas-sonic.webp', '/data/theme/gas-sonic.webp']);
  const after = await lumaAt(page, patch);
  expect(after).toBeGreaterThan(SKY_LUMA * 3);
  expect(Math.abs(after - before), 'the same gas as before the loss').toBeLessThan(2);
  // a slider move after the restore draws the other stops from their new textures, with no error
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForMapQuiet(page, 300);
  const vp = page.viewportSize()!;
  expect(await lumaAt(page, { x: vp.width / 2 - 150, y: vp.height / 2 - 150, w: 300, h: 300 })).toBeGreaterThan(SKY_LUMA * 2);
  expect(errors).toEqual([]);
  // and at rest nothing draws
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBeLessThanOrEqual(1);
});

test('without theme data the map still works, with plain sky and no gas requests', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const gasRequests: string[] = [];
  page.on('request', (r) => {
    if (/\/data\/theme\/gas-\w+\.webp$/.test(r.url())) gasRequests.push(r.url());
  });
  await page.route('**/data/theme/theme.json', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' }));
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('off');
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('ok');
  await expect(page.locator('canvas.map-canvas')).toBeVisible();
  const p = await visibleAlbumPoint(page);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
  expect(gasRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('Home loads only the gas of the stop it shows, and the other two wait for the map', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const requested: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/data/theme/')) requested.push(new URL(r.url()).pathname);
  });
  await page.goto('/');
  await waitForMap(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  await page.waitForTimeout(1500); // well past the idle slot in which an interactive map fetches the other stops
  expect([...requested].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/theme.json']);
  // The same canvas becomes the interactive map: now, and only now, the other two stops are fetched.
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await expect.poll(() => [...requested].sort()).toEqual(['/data/theme/gas-balanced.webp', '/data/theme/gas-mood.webp', '/data/theme/gas-sonic.webp', '/data/theme/theme.json']);
  await waitForMap(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
});
