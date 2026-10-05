import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { COPY } from '../src/lib/copy';
import { isPhone, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap, waitForMapQuiet } from './helpers';

/** The committed theme: every gas image carries the hash of its content in its name (theme.json gas.<stop>.hash). */
type Stop = 'sonic' | 'balanced' | 'mood';
const THEME = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/data/theme/theme.json'), 'utf8')) as {
  gas: Record<Stop, { rect: [number, number, number, number]; px: [number, number]; sharp: [number, number]; hash: [string, string] }>;
};
/** Path of a stop's first image, or of its sharper one. */
const gasPath = (stop: Stop, sharper = false): string => `/data/theme/gas-${stop}${sharper ? '-sharp' : ''}.${THEME.gas[stop].hash[sharper ? 1 : 0]}.webp`;
const THEME_JSON = '/data/theme/theme.json';
/** Any first image (not a sharper one), and any sharper image. */
const FIRST_IMAGE = /\/data\/theme\/gas-(sonic|balanced|mood)\.[0-9a-f]{10}\.webp$/;
const SHARP_IMAGE = /\/data\/theme\/gas-(sonic|balanced|mood)-sharp\.[0-9a-f]{10}\.webp$/;
/** The first images of the two stops the map does not open on. */
const LATE_IMAGE = /\/data\/theme\/gas-(sonic|mood)\.[0-9a-f]{10}\.webp$/;

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

/** Counts the uploads of the stops' first gas images (the only ImageBitmaps with a longer side of 2048 px that
 * the page hands to WebGL; a stop's image covers its own rectangle, so the shorter side differs) and when each
 * happened. Call before page.goto. */
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
        if (src instanceof ImageBitmap && Math.max(src.width, src.height) === 2048) {
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
  const late = LATE_IMAGE;
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

/** One strip of a sharper image as it was handed to WebGL: where it went, how many rows, how many rows the source
 * image has, and the row and pixel offsets into the source that were set at that moment. */
interface StripUpload {
  /** Width of the source image: tells the stops' sharper images apart. */
  width: number;
  y: number;
  rows: number;
  sourceRows: number;
  skipRows: number;
  skipPixels: number;
}

interface Gesture {
  /** Gas uploads (first images and strips of a sharper one) counted when the gesture began and in its last frame. */
  uploadsAtStart: number;
  uploadsAtEnd: number;
  /** Every gap between two animation frames while the gesture ran, ms. */
  gaps: number[];
  /** When the gesture began, and every texture upload of any kind (the map's own cover sheets among them) and
   * every long task inside it, for the message of a failed check. */
  other: string[];
}

/**
 * Installs, before the page loads: a count of every gas upload (first images by their longer side of 2048 px,
 * strips of a sharper image by its width, whichever way the strip is cut), `__gesture.start(kind)` which begins a
 * gesture in the very task it is called in (a drag with the button down, or a run of wheel events, one event per
 * frame until `__gesture.stop()`), and two one-shot hooks: `__onFence`, called the next time the map asks the GPU
 * for a fence (the wait every upload sits behind), and `__onStrip`, called inside the next strip upload.
 */
async function installGestures(page: Page): Promise<void> {
  const sharpWidths = (Object.keys(THEME.gas) as Stop[]).map((s) => THEME.gas[s].sharp[0]);
  await page.addInitScript((widths) => {
    interface G {
      uploads: number;
      strips: number;
      stripLog: StripUpload[];
      onFence: (() => void) | null;
      onStrip: (() => void) | null;
      run: { stop: boolean; done: Promise<void>; uploadsAtStart: number; uploadsAtEnd: number; gaps: number[]; other: string[] } | null;
      start: (kind: 'drag' | 'wheel') => void;
      stop: () => Promise<{ uploadsAtStart: number; uploadsAtEnd: number; gaps: number[]; other: string[] }>;
    }
    const g: G = {
      uploads: 0,
      strips: 0,
      stripLog: [],
      onFence: null,
      onStrip: null,
      run: null,
      start(kind) {
        const c = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!;
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const fire = (t: string, x: number, y: number) =>
          c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
        const run = { stop: false, done: Promise.resolve(), uploadsAtStart: g.uploads + g.strips, uploadsAtEnd: -1, gaps: [] as number[], other: [`began at ${Math.round(performance.now())} ms`] };
        g.run = run;
        if (kind === 'drag') fire('pointerdown', cx, cy);
        run.done = (async () => {
          const t0 = performance.now();
          let last = t0;
          while (!run.stop) {
            const k = (performance.now() - t0) / 2000;
            if (kind === 'drag') fire('pointermove', cx + Math.sin(k * 6.28) * 140, cy + Math.cos(k * 6.28) * 100);
            else c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx + 60, clientY: cy - 40, deltaY: Math.floor(k) % 2 === 0 ? -12 : 12 }));
            const now = await new Promise<number>((res) => requestAnimationFrame(() => res(performance.now())));
            run.gaps.push(now - last);
            last = now;
          }
          run.uploadsAtEnd = g.uploads + g.strips;
          if (kind === 'drag') fire('pointerup', cx, cy);
        })();
      },
      async stop() {
        const run = g.run!;
        run.stop = true;
        await run.done;
        return { uploadsAtStart: run.uploadsAtStart, uploadsAtEnd: run.uploadsAtEnd, gaps: run.gaps, other: run.other };
      },
    };
    (window as unknown as { __gesture: G }).__gesture = g;
    const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const fn of ['texImage2D', 'texSubImage2D']) {
      const orig = P[fn];
      P[fn] = function (this: unknown, ...a: unknown[]) {
        const src = a[a.length - 1];
        const t0 = performance.now();
        const out = orig.apply(this, a);
        const sized = src as { width?: number; height?: number } | null;
        if (g.run && !g.run.stop) g.run.other.push(`${fn} ${sized?.width ?? '?'} x ${sized?.height ?? '?'} at ${Math.round(t0)} ms, ${Math.round(performance.now() - t0)} ms`);
        if (src instanceof ImageBitmap) {
          if (Math.max(src.width, src.height) === 2048) g.uploads += 1;
          else if (widths.includes(src.width)) {
            g.strips += 1;
            const gl = this as WebGL2RenderingContext;
            g.stripLog.push({ width: src.width, y: a[3] as number, rows: a[5] as number, sourceRows: src.height, skipRows: gl.getParameter(gl.UNPACK_SKIP_ROWS) as number, skipPixels: gl.getParameter(gl.UNPACK_SKIP_PIXELS) as number });
            const hook = g.onStrip;
            g.onStrip = null;
            hook?.();
          }
        }
        return out;
      };
    }
    // long tasks on the main thread, for the message of a failed frame gap check
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (g.run && !g.run.stop) g.run.other.push(`long task at ${Math.round(e.startTime)} ms, ${Math.round(e.duration)} ms`);
      }).observe({ type: 'longtask' });
    }
    const fence = P.fenceSync;
    P.fenceSync = function (this: unknown, ...a: unknown[]) {
      const out = fence.apply(this, a);
      const hook = g.onFence;
      g.onFence = null;
      hook?.();
      return out;
    };
  }, sharpWidths);
}
type GestureWindow = { __gesture: { uploads: number; strips: number; stripLog: StripUpload[]; onFence: (() => void) | null; onStrip: (() => void) | null; start: (kind: 'drag' | 'wheel') => void; stop: () => Promise<Gesture> } };
const gestureCounts = (page: Page): Promise<{ uploads: number; strips: number }> =>
  page.evaluate(() => {
    const g = (window as unknown as GestureWindow).__gesture;
    return { uploads: g.uploads, strips: g.strips };
  });
const stopGesture = (page: Page): Promise<Gesture> => page.evaluate(() => (window as unknown as GestureWindow).__gesture.stop());
/** The same gesture with nothing waiting to be uploaded, for `ms`: the frame gaps a gesture has by itself. */
async function controlGesture(page: Page, kind: 'drag' | 'wheel', ms: number): Promise<Gesture> {
  await waitForMapQuiet(page, 400);
  await page.evaluate((k) => (window as unknown as GestureWindow).__gesture.start(k), kind);
  await page.waitForTimeout(ms);
  return stopGesture(page);
}
/** The longest frame gap of a gesture, leaving out its first frame (which starts at a random point of a vsync). */
const worstGap = (g: Gesture): number => Math.max(...g.gaps.slice(1));
/** An upload inside a gesture would add its whole main-thread time to one frame: on the test browser's software
 * renderer 60 ms and more for a first image. A gesture with no upload in it has the control's frame gaps, give or
 * take what two runs of the same drag differ by on this renderer. */
function expectGapsOfControl(got: Gesture, control: Gesture): void {
  expect(got.gaps.length, 'frames in the gesture').toBeGreaterThan(3);
  expect(worstGap(got), `longest frame gap with an image waiting (control ${Math.round(worstGap(control))} ms; gaps ${got.gaps.map(Math.round).join(' ')}; inside the gesture: ${got.other.join('; ')})`).toBeLessThanOrEqual(worstGap(control) * 1.25 + 17);
}

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
  await expect.poll(() => [...requested].sort()).toEqual([gasPath('balanced'), gasPath('mood'), gasPath('sonic'), THEME_JSON].sort());
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
  await page.route(`**${gasPath('mood')}`, async (route) => {
    await held;
    await route.continue();
  });
  const balanced = page.waitForResponse((r) => r.url().endsWith(gasPath('balanced')) && r.ok());
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
  const late = LATE_IMAGE;
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
    if (FIRST_IMAGE.test(r.url())) gasRequests.push(new URL(r.url()).pathname);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const patch = await patchAt(page, IN_RAINBOWS, [0, 0], 80);
  const before = await lumaAt(page, patch);
  expect(before).toBeGreaterThan(SKY_LUMA * 3);
  expect([...gasRequests].sort()).toEqual([gasPath('balanced'), gasPath('mood'), gasPath('sonic')].sort());
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
  expect([...gasRequests].sort()).toEqual([gasPath('balanced'), gasPath('balanced'), gasPath('mood'), gasPath('mood'), gasPath('sonic'), gasPath('sonic')].sort());
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
    if (/\/data\/theme\/gas-.*\.webp$/.test(r.url())) gasRequests.push(r.url());
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
  expect([...requested].sort()).toEqual([gasPath('balanced'), THEME_JSON].sort());
  // The same canvas becomes the interactive map: now, and only now, the other two stops are fetched.
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await expect.poll(() => [...requested].sort()).toEqual([gasPath('balanced'), gasPath('mood'), gasPath('sonic'), THEME_JSON].sort());
  await waitForMap(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
});

test('a zoomed-in desktop map gets the sharper image of the stop at rest, one at a time, with a short fade and nothing at rest', async ({ page }, info) => {
  test.skip(isPhone(info), 'the sharper image is for desktops');
  // The test browser renders in software, where the app would not load the sharper image by itself.
  await page.addInitScript(() => {
    window.__rmrGasSharp = 'force';
    // every 16 ms: frames drawn and the sharper image's state
    const log: [number, string][] = [];
    (window as unknown as { __sharpLog: [number, string][] }).__sharpLog = log;
    setInterval(() => log.push([window.__rmr?.frames ?? 0, String(window.__rmr?.gasSharp)]), 16);
  });
  const sharpRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (SHARP_IMAGE.test(r.url())) sharpRequests.push(new URL(r.url()).pathname);
  });
  const sharp = () => page.evaluate(() => window.__rmr!.gasSharp);
  await installGestures(page);
  // Balanced's sharper image is held back until the picture with the first image has been read.
  let releaseSharp = (): void => {};
  const sharpHeld = new Promise<void>((resolve) => {
    releaseSharp = resolve;
  });
  await page.route(`**${gasPath('balanced', true)}`, async (route) => {
    await sharpHeld;
    await route.continue();
  });
  /** Median luma of a 4 by 3 grid of 120 px patches over the map pane. */
  const picture = async (): Promise<number[]> => {
    const vp = page.viewportSize()!;
    const out: number[] = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) out.push(await lumaAt(page, { x: 200 + (i * (vp.width - 520)) / 3, y: 160 + (j * (vp.height - 440)) / 2, w: 120, h: 120 }));
    return out;
  };
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect.poll(() => page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  // As the map opens, the whole cloud fits the pane: the first image has more texels than the screen has px,
  // so no sharper image is fetched however long the map rests.
  await page.waitForTimeout(1200);
  expect(sharpRequests).toEqual([]);
  expect(await sharp()).toBe('waiting');

  // Zoomed in three times the first image is magnified: the sharper image of the stop on screen comes in.
  await page.evaluate(() => {
    const api = window.__rmr!.map!;
    const cam = api.getCamera();
    api.setCamera({ ...cam, zoom: cam.zoom * 3 }, false);
  });
  await expect.poll(() => sharpRequests).toEqual([gasPath('balanced', true)]);
  await waitForMapQuiet(page, 400);
  expect(await sharp()).toBe('loading');
  const before = await picture();
  releaseSharp();
  await expect.poll(sharp, { timeout: 30000 }).toBe('balanced');
  expect(sharpRequests).toEqual([gasPath('balanced', true)]);
  await page.waitForTimeout(700);
  // Every strip went to WebGL as a whole image of its own rows, with no offset into a larger source for a browser
  // to misread, and together the strips are the image, each row once, in place.
  const strips = (await page.evaluate(() => (window as unknown as GestureWindow).__gesture.stripLog)).sort((a, b) => a.y - b.y);
  expect(strips).toHaveLength(16);
  let row = 0;
  for (const st of strips) {
    expect(st, `strip at row ${st.y}`).toEqual({ width: THEME.gas.balanced.sharp[0], y: row, rows: st.rows, sourceRows: st.rows, skipRows: 0, skipPixels: 0 });
    row += st.rows;
  }
  expect(row).toBe(THEME.gas.balanced.sharp[1]);
  // And the picture is the one the first image showed, in focus: a strip in the wrong place, or one strip written
  // sixteen times, would change these patches by tens of levels (the two images differ by a level or two).
  const after = await picture();
  expect(Math.max(...before), 'the patches show gas').toBeGreaterThan(SKY_LUMA * 3);
  after.forEach((v, i) => expect(Math.abs(v - before[i]), `patch ${i}: ${before[i].toFixed(1)} with the first image, ${v.toFixed(1)} with the sharper one`).toBeLessThan(4));
  const log = await page.evaluate(() => (window as unknown as { __sharpLog: [number, string][] }).__sharpLog);
  const firstLoading = log.findIndex(([, s]) => s === 'loading');
  expect(firstLoading).toBeGreaterThan(-1);
  // From the moment it began to load (the map was at rest by then) to 700 ms after it is in, the only frames are
  // those of the fade from the first image to the sharper one: the frame that starts its clock, 200 ms (at most
  // 12 frames at 60 a second) and the frame that ends it. At least three, or it would be a snap (with reduced
  // motion it is one frame: see the test at the end of this file).
  const fadeFrames = log[log.length - 1][0] - log[firstLoading][0];
  expect(fadeFrames).toBeGreaterThanOrEqual(3);
  expect(fadeFrames).toBeLessThanOrEqual(14);
  // and the fade has ended: not one frame more
  const afterFade = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1000);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - afterFade).toBe(0);
  expect(await lumaAt(page, await patchAt(page, IN_RAINBOWS, [0, 0], 80))).toBeGreaterThan(SKY_LUMA * 3);

  // The slider goes to Mood: once it rests there Balanced's sharper image is freed and Mood's is fetched.
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(sharp, { timeout: 30000 }).toBe('mood');
  expect(sharpRequests).toEqual([gasPath('balanced', true), gasPath('mood', true)]);
  await waitForMapQuiet(page, 400);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBe(0);
  expect(await lumaAt(page, await patchAt(page, IN_RAINBOWS, [0, 0], 80))).toBeGreaterThan(SKY_LUMA * 3);
  expect(errors).toEqual([]);
});

test('Home never fetches a sharper image, and a software renderer does not either', async ({ page }, info) => {
  test.skip(isPhone(info), 'the sharper image is for desktops');
  const sharpRequests: string[] = [];
  page.on('request', (r) => {
    if (/-sharp\./.test(r.url())) sharpRequests.push(new URL(r.url()).pathname);
  });
  // Home, with the software renderer's rule lifted: the backdrop is not an interactive map.
  await page.addInitScript(() => {
    if (location.pathname === '/') window.__rmrGasSharp = 'force';
  });
  await page.goto('/');
  await waitForMap(page);
  await page.waitForTimeout(1500);
  expect(sharpRequests).toEqual([]);
  // The map, zoomed in, on the test browser's software renderer with no override.
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect.poll(() => page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  await page.evaluate(() => {
    const api = window.__rmr!.map!;
    const cam = api.getCamera();
    api.setCamera({ ...cam, zoom: cam.zoom * 3 }, false);
  });
  await expect.poll(() => page.evaluate(() => window.__rmr!.gasSharp), { timeout: 15000 }).toBe('off');
  await page.waitForTimeout(800);
  expect(sharpRequests).toEqual([]);
});

test('an image of another bake is refused: that stop shows plain sky, never gas in the wrong place, and the other stops still draw', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  const errors: string[] = [];
  const refused: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes('gas texture refused')) refused.push(m.text());
  });
  // What a browser cache could hold after a new bake if the names did not change: the whole square at
  // 2048 x 2048 where theme.json describes a rectangle of another size. Bright, so a wrong draw cannot be missed.
  const square = await sharp({ create: { width: 2048, height: 2048, channels: 4, background: { r: 230, g: 150, b: 90, alpha: 1 } } }).webp({ quality: 50 }).toBuffer();
  expect(THEME.gas.balanced.px).not.toEqual([2048, 2048]);
  await page.route(`**${gasPath('balanced')}`, (route) => route.fulfill({ status: 200, contentType: 'image/webp', body: square }));
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300);
  // settled (not stuck on 'loading'), with the refusal said once in the console
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
  expect(refused).toHaveLength(1);
  expect(refused[0]).toContain('2048 x 2048');
  // Balanced, at rest: plain sky between the albums, not the bright square and not another stop's gas.
  // (the 10th percentile reads the background; the sky is about 6, the old test's gas over 18, the square over 150)
  const vp = page.viewportSize()!;
  const middle = { x: vp.width / 2 - 150, y: vp.height / 2 - 150, w: 300, h: 300 };
  expect(await lumaAt(page, middle, 0.1)).toBeLessThan(SKY_LUMA + 4);
  expect(await lumaAt(page, middle, 0.5)).toBeLessThan(SKY_LUMA * 2);
  // The map still works and the stops whose images are right still show their gas.
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  await expect.poll(() => page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  await waitForMapQuiet(page, 300);
  expect(await lumaAt(page, middle)).toBeGreaterThan(SKY_LUMA * 2);
  expect(errors).toEqual([]);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBeLessThanOrEqual(1);
});

test('a drag that begins while a late image waits behind the GPU fence gets no upload, and has the frame gaps of a drag with nothing waiting', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const late = await holdLateGas(page);
  await installGestures(page);
  await page.goto('/map');
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'loading', null, { timeout: 20_000 });
  await waitForMapQuiet(page, 400);
  expect((await gestureCounts(page)).uploads, 'only the stop on screen is uploaded so far').toBe(1);
  // The map is quiet, so a late image that arrives now is cleared for upload and waits only for the GPU fence
  // (34 to 100 ms). The drag begins in the very task that asks for that fence.
  await page.evaluate(() => {
    const g = (window as unknown as GestureWindow).__gesture;
    g.onFence = () => g.start('drag');
  });
  late.release();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gesture: { run: unknown } }).__gesture.run !== null), { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(1200);
  const drag = await stopGesture(page);
  expect(drag.uploadsAtEnd - drag.uploadsAtStart, 'gas uploads inside the drag').toBe(0);
  expect(drag.uploadsAtStart).toBe(1);
  // Left alone, both go in.
  await waitForMap(page);
  expect((await gestureCounts(page)).uploads).toBe(3);
  expectGapsOfControl(drag, await controlGesture(page, 'drag', 1200));
  expect(errors).toEqual([]);
});

test('a drag or a wheel zoom held longer than the longest wait gets no upload until it ends', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const kind of ['drag', 'wheel'] as const) {
    const late = await holdLateGas(page);
    await installGestures(page);
    await page.goto('/map');
    await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && window.__rmr?.gas === 'loading', null, { timeout: 20_000 });
    await waitForMapQuiet(page, 400);
    await page.evaluate((k) => (window as unknown as GestureWindow).__gesture.start(k), kind);
    late.release();
    await expect.poll(() => late.arrived()).toBe(2);
    // Both images are decoded and waiting. 4 s is the longest an image waits for a quiet map; the gesture goes on
    // well past it.
    await page.waitForTimeout(5500);
    expect(await page.evaluate(() => window.__rmr!.gas)).toBe('loading');
    const held = await stopGesture(page);
    expect(held.uploadsAtEnd - held.uploadsAtStart, `gas uploads inside the ${kind}`).toBe(0);
    await waitForMap(page);
    expect((await gestureCounts(page)).uploads).toBe(3);
    expectGapsOfControl(held, await controlGesture(page, kind, 5500));
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
  expect(errors).toEqual([]);
});

test('a drag that begins between two strips of a sharper image, or inside one, gets no further strip', async ({ page }, info) => {
  test.skip(isPhone(info), 'the sharper image is for desktops');
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__rmrGasSharp = 'force';
  });
  await installGestures(page);
  for (const when of ['fence', 'strip'] as const) {
    // The sharper image is held back while the view is warmed: the first drag at this zoom brings in cover sheets
    // (uploads of the map's own, 400 ms and more on this renderer), which the control drag would not have.
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(SHARP_IMAGE, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await page.evaluate(() => {
      const api = window.__rmr!.map!;
      const cam = api.getCamera();
      api.setCamera({ ...cam, zoom: cam.zoom * 3 }, false);
    });
    await controlGesture(page, 'drag', 2100);
    await waitForMapQuiet(page, 800);
    expect((await gestureCounts(page)).strips).toBe(0);
    // After the third strip: 'fence' begins the drag in the task that asks for the next strip's fence (the map
    // was found quiet a moment before), 'strip' begins it inside the fourth strip's upload call.
    await page.evaluate((w) => {
      const g = (window as unknown as GestureWindow).__gesture;
      const arm = () => {
        if (g.strips < 3) return void (g.onStrip = arm);
        if (w === 'fence') g.onFence = () => g.start('drag');
        else g.onStrip = () => g.start('drag');
      };
      g.onStrip = arm;
    }, when);
    release();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __gesture: { run: unknown } }).__gesture.run !== null), { timeout: 30_000 }).toBe(true);
    await page.waitForTimeout(1200);
    const drag = await stopGesture(page);
    expect(drag.uploadsAtEnd - drag.uploadsAtStart, `strips inside the drag (begun at a ${when})`).toBe(0);
    expect(await page.evaluate(() => window.__rmr!.gasSharp), 'the image is still on its way').toBe('loading');
    // Left alone, the rest goes in and the image is used.
    await expect.poll(() => page.evaluate(() => window.__rmr!.gasSharp), { timeout: 30_000 }).toBe('balanced');
    expect((await gestureCounts(page)).strips).toBe(16);
    await waitForMapQuiet(page, 400);
    expectGapsOfControl(drag, await controlGesture(page, 'drag', 1200));
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
  expect(errors).toEqual([]);
});

/** Zooms the map in three times, where the first image is magnified and the sharper one is wanted. */
const zoomIn = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const api = window.__rmr!.map!;
    const cam = api.getCamera();
    api.setCamera({ ...cam, zoom: cam.zoom * 3 }, false);
  });
const sharpFlag = (page: Page) => page.evaluate(() => window.__rmr!.gasSharp);
async function forceSharp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__rmrGasSharp = 'force';
  });
}

test('a sharper image that fails to load is asked for once more, and after a second failure the first image stays and nothing draws', async ({ page }, info) => {
  test.skip(isPhone(info), 'the sharper image is for desktops');
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await forceSharp(page);
  for (const failures of [1, 2] as const) {
    const said: string[] = [];
    const onConsole = (m: { type: () => string; text: () => string }) => {
      if (m.type() === 'error' && m.text().includes('sharper gas image failed')) said.push(m.text());
    };
    page.on('console', onConsole);
    let asked = 0;
    await page.route(SHARP_IMAGE, async (route) => {
      asked += 1;
      if (asked <= failures) await route.abort('failed');
      else await route.continue();
    });
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await zoomIn(page);
    if (failures === 1) {
      // dropped once: asked for again, and it comes in
      await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('balanced');
      expect(asked).toBe(2);
      expect(said).toHaveLength(1);
    } else {
      // dropped twice: given up for this map, with the first image still on screen
      await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('off');
      expect(asked).toBe(2);
      expect(said).toHaveLength(2);
      await waitForMapQuiet(page, 400);
      const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
      await page.waitForTimeout(3500); // well past another retry, had there been one
      expect(asked, 'not asked for a third time').toBe(2);
      expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBe(0);
      expect(await sharpFlag(page)).toBe('off');
      expect(await page.evaluate(() => window.__rmr!.gas)).toBe('ready');
      expect(await lumaAt(page, await patchAt(page, IN_RAINBOWS, [0, 0], 80))).toBeGreaterThan(SKY_LUMA * 3);
    }
    page.off('console', onConsole);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
  expect(pageErrors).toEqual([]);
});

test('a sharper image that is cancelled drops its download, and one cancelled between strips sends no more of them', async ({ page }, info) => {
  test.skip(isPhone(info), 'the sharper image is for desktops');
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const aborted: string[] = [];
  page.on('requestfailed', (r) => {
    if (SHARP_IMAGE.test(r.url())) aborted.push(`${new URL(r.url()).pathname} ${r.failure()?.errorText}`);
  });
  await forceSharp(page);
  await installGestures(page);

  // 1. Cancelled while it downloads: Balanced's sharper image never arrives; the slider goes to rest at Mood.
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${gasPath('balanced', true)}`, async (route) => {
    await held;
    await route.abort('aborted').catch(() => {});
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await zoomIn(page);
  await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('loading');
  await page.evaluate(() => window.__rmr!.getState().setStop('mood'));
  // the page itself gives the download up, as soon as the slider rests at Mood (the route is still holding it)
  await expect.poll(() => aborted, { timeout: 30_000 }).toEqual([`${gasPath('balanced', true)} net::ERR_ABORTED`]);
  await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('mood');
  expect((await gestureCounts(page)).strips, "only Mood's strips were sent").toBe(16);
  release();
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // 2. Cancelled between strips: after Balanced's fourth strip the slider goes to Mood.
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await zoomIn(page);
  await page.evaluate(() => {
    const g = (window as unknown as GestureWindow).__gesture;
    const arm = () => {
      if (g.strips < 4) return void (g.onStrip = arm);
      window.__rmr!.getState().setStop('mood');
    };
    g.onStrip = arm;
  });
  await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('mood');
  await waitForMapQuiet(page, 400);
  const log = await page.evaluate(() => (window as unknown as GestureWindow).__gesture.stripLog);
  const of = (stop: Stop) => log.filter((st) => st.width === THEME.gas[stop].sharp[0]).length;
  // Balanced stopped where it was cancelled (the half sent image is thrown away, never drawn) and Mood is whole
  expect(of('balanced')).toBe(4);
  expect(of('mood')).toBe(16);
  expect(await lumaAt(page, await patchAt(page, IN_RAINBOWS, [0, 0], 80))).toBeGreaterThan(SKY_LUMA * 2);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBe(0);
  expect(errors).toEqual([]);
});

test('a sharper image lost with the WebGL context comes back after the first images, and one released on screen is replaced in one frame', async ({ page }, info) => {
  test.skip(isPhone(info), 'the sharper image is for desktops');
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const sharpRequests: string[] = [];
  page.on('request', (r) => {
    if (SHARP_IMAGE.test(r.url())) sharpRequests.push(new URL(r.url()).pathname);
  });
  await forceSharp(page);
  // every change of the sharper image's flag, with the frames drawn by then
  await page.addInitScript(() => {
    const log: [string, number][] = [];
    (window as unknown as { __flagLog: [string, number][] }).__flagLog = log;
    const watch = () => {
      const r = window.__rmr as (Record<string, unknown> & { frames?: number }) | undefined;
      if (!r) return void setTimeout(watch, 5);
      let value = r.gasSharp;
      Object.defineProperty(r, 'gasSharp', {
        configurable: true,
        get: () => value,
        set: (v) => {
          value = v;
          log.push([String(v), r.frames ?? 0]);
        },
      });
    };
    watch();
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await zoomIn(page);
  await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('balanced');
  await waitForMapQuiet(page, 400);
  const patch = await patchAt(page, IN_RAINBOWS, [0, 0], 80);
  const before = await lumaAt(page, patch);
  expect(before).toBeGreaterThan(SKY_LUMA * 3);

  // The context goes: the sharper image goes with it, and says so.
  const flags = await page.evaluate(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!;
    const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    const lostEvent = new Promise((resolve) => canvas.addEventListener('webglcontextlost', resolve, { once: true }));
    const restored = new Promise((resolve) => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
    lose.loseContext();
    await lostEvent;
    await new Promise((resolve) => setTimeout(resolve, 300));
    const whileLost = window.__rmr!.gasSharp;
    lose.restoreContext();
    await restored;
    return { whileLost, onRestore: window.__rmr!.gasSharp };
  });
  expect(flags).toEqual({ whileLost: 'waiting', onRestore: 'waiting' });
  // Back: the first images, then the sharper one again (a second request, from the HTTP cache), the same picture.
  await waitForMap(page);
  await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('balanced');
  expect(sharpRequests).toEqual([gasPath('balanced', true), gasPath('balanced', true)]);
  await waitForMapQuiet(page, 400);
  expect(Math.abs((await lumaAt(page, patch)) - before), 'the same gas as before the loss').toBeLessThan(2);
  let f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBe(0);

  // About: the same canvas becomes a backdrop, which never holds a sharper image. A pointer that keeps moving
  // over the header holds the release back until the page change has finished drawing, so the release stands
  // alone: it happens while the image is on screen, and exactly one frame follows it (the first image drawn in
  // its place), then nothing.
  await keepBusy(page, 'move');
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.about, exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await waitForMapQuiet(page, 800);
  expect(await sharpFlag(page), 'still held while the pointer moves').toBe('balanced');
  await stopBusy(page);
  await expect.poll(() => sharpFlag(page), { timeout: 15_000 }).toBe('waiting');
  await waitForMapQuiet(page, 400);
  f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  const flagLog = await page.evaluate(() => (window as unknown as { __flagLog: [string, number][] }).__flagLog);
  // (the flag is written again at every later look; the release is the first 'waiting' after the last 'balanced')
  const released = flagLog[flagLog.map(([v]) => v).lastIndexOf('balanced') + 1];
  expect(released[0]).toBe('waiting');
  expect(f1 - released[1], 'frames drawn after the sharper image was released').toBe(1);
  await page.waitForTimeout(1200);
  expect((await page.evaluate(() => window.__rmr!.frames ?? 0)) - f1).toBe(0);
  expect(errors).toEqual([]);
});

test('a touch device never fetches a sharper image and says so from the start, even with the software rule lifted', async ({ page }, info) => {
  test.skip(!isPhone(info), 'the phone project is the touch device');
  const sharpRequests: string[] = [];
  page.on('request', (r) => {
    if (/-sharp\./.test(r.url())) sharpRequests.push(new URL(r.url()).pathname);
  });
  await forceSharp(page);
  await page.goto('/map');
  await page.waitForFunction(() => window.__rmr?.gasSharp !== undefined, null, { timeout: 20_000 });
  // decided when the gas layer mounts: no 'waiting' first
  expect(await sharpFlag(page)).toBe('off');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await zoomIn(page);
  await waitForMapQuiet(page, 400);
  await page.waitForTimeout(1500);
  expect(await sharpFlag(page)).toBe('off');
  expect(sharpRequests).toEqual([]);
});

test('on screen the gas lies under the albums it was baked for: the picture matches the image mapped through the albums\' own positions', async ({ page }, info) => {
  test.skip(isPhone(info), 'the gas checks use the desktop framing');
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 400);
  // Where every album is on screen, and which points of a 16 px grid show bare map.
  const seen = await page.evaluate(() => {
    const api = window.__rmr!.map!;
    const pts: ({ x: number; y: number } | null)[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      pts.push(p.x > 0 && p.y > 0 && p.x < innerWidth && p.y < innerHeight ? p : null);
    }
    const grid: [number, number][] = [];
    for (let y = 100; y <= innerHeight - 100; y += 16) {
      for (let x = 40; x <= innerWidth - 40; x += 16) {
        if (document.elementFromPoint(x, y)?.classList.contains('map-canvas') && pts.every((p) => !p || Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 7)) grid.push([x, y]);
      }
    }
    return { pts, grid };
  });
  // The map's own transform from raw positions (positions.json) to the screen, fitted to the albums on screen:
  // screen x = ax + s * raw x, screen y = ay - s * raw y.
  const raw = (JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/data/positions.json'), 'utf8')) as Record<Stop, number[]>).balanced;
  const on = seen.pts.map((p, i) => (p ? { sx: p.x, sy: p.y, x: raw[2 * i], y: raw[2 * i + 1] } : null)).filter((p) => p !== null);
  expect(on.length).toBeGreaterThan(1000);
  const mean = (f: (p: (typeof on)[number]) => number) => on.reduce((sum, p) => sum + f(p), 0) / on.length;
  const mx = mean((p) => p.x);
  const my = mean((p) => p.y);
  const msx = mean((p) => p.sx);
  const msy = mean((p) => p.sy);
  const scale = on.reduce((sum, p) => sum + (p.x - mx) * (p.sx - msx) - (p.y - my) * (p.sy - msy), 0) / on.reduce((sum, p) => sum + (p.x - mx) ** 2 + (p.y - my) ** 2, 0);
  const toRaw = (sx: number, sy: number): [number, number] => [mx + (sx - msx) / scale, my - (sy - msy) / scale];
  // the fit is exact to a fraction of a px, or the comparison below would prove nothing
  for (const p of on.slice(0, 50)) {
    const [x, y] = toRaw(p.sx, p.sy);
    expect(Math.hypot(x - p.x, y - p.y) * scale).toBeLessThan(0.5);
  }
  expect(seen.grid.length).toBeGreaterThan(400);
  // The baked image, as theme.json places it, against the screenshot.
  const g = THEME.gas.balanced;
  const image = await sharp(path.resolve(process.cwd(), `public${gasPath('balanced')}`)).raw().toBuffer({ resolveWithObject: true });
  const shotPng = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const k = shotPng.info.width / page.viewportSize()!.width;
  const screenLuma = seen.grid.map(([x, y]) => {
    // the median of a 5 px square: gas, not a stray dot
    const v: number[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const o = 3 * (Math.round((y + dy) * k) * shotPng.info.width + Math.round((x + dx) * k));
        v.push(0.2126 * shotPng.data[o] + 0.7152 * shotPng.data[o + 1] + 0.0722 * shotPng.data[o + 2]);
      }
    }
    return v.sort((a, b) => a - b)[12];
  });
  const [x0, y0, x1, y1] = g.rect;
  const imageLuma = (mirrorX: boolean, mirrorY: boolean, dx: number, dy: number): number[] =>
    seen.grid.map(([sx, sy]) => {
      let [x, y] = toRaw(sx, sy);
      x += dx;
      y += dy;
      if (mirrorX) x = x0 + x1 - x;
      if (mirrorY) y = y0 + y1 - y;
      const u = (x - x0) / (x1 - x0);
      const v = (y1 - y) / (y1 - y0);
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
      const o = 4 * (Math.floor(v * image.info.height) * image.info.width + Math.floor(u * image.info.width));
      // the light the dust lets through, as the shader draws it at the overview
      return (0.2126 * image.data[o] + 0.7152 * image.data[o + 1] + 0.0722 * image.data[o + 2]) * (image.data[o + 3] / 255);
    });
  const corr = (a: number[], b: number[]): number => {
    const ma = a.reduce((sum, v) => sum + v, 0) / a.length;
    const mb = b.reduce((sum, v) => sum + v, 0) / b.length;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < a.length; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return sab / Math.sqrt(saa * sbb);
  };
  const inPlace = corr(screenLuma, imageLuma(false, false, 0, 0));
  const others = {
    'mirrored east to west': corr(screenLuma, imageLuma(true, false, 0, 0)),
    'mirrored north to south': corr(screenLuma, imageLuma(false, true, 0, 0)),
    // 0.03 raw units is about 11 px at this framing
    'moved east': corr(screenLuma, imageLuma(false, false, 0.03, 0)),
    'moved west': corr(screenLuma, imageLuma(false, false, -0.03, 0)),
    'moved north': corr(screenLuma, imageLuma(false, false, 0, 0.03)),
    'moved south': corr(screenLuma, imageLuma(false, false, 0, -0.03)),
  };
  console.log(`registration on screen: r ${inPlace.toFixed(4)} over ${seen.grid.length} points; ${Object.entries(others).map(([name, r]) => `${name} ${r.toFixed(4)}`).join(', ')}`);
  expect(inPlace).toBeGreaterThan(0.9);
  for (const [name, r] of Object.entries(others)) expect(r, name).toBeLessThan(inPlace - 0.01);
});

test('with reduced motion the sharper image is swapped in with one frame, and nothing draws after it', async ({ page }, info) => {
  test.skip(isPhone(info), 'the sharper image is for desktops');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__rmrGasSharp = 'force';
    const log: [number, string][] = [];
    (window as unknown as { __sharpLog: [number, string][] }).__sharpLog = log;
    setInterval(() => log.push([window.__rmr?.frames ?? 0, String(window.__rmr?.gasSharp)]), 16);
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await zoomIn(page);
  await expect.poll(() => sharpFlag(page), { timeout: 30_000 }).toBe('balanced');
  await page.waitForTimeout(700);
  const log = await page.evaluate(() => (window as unknown as { __sharpLog: [number, string][] }).__sharpLog);
  const firstLoading = log.findIndex(([, s]) => s === 'loading');
  expect(firstLoading).toBeGreaterThan(-1);
  // From the moment it began to load (the map was at rest by then) to 700 ms after it is in: one frame, the swap.
  expect(log[log.length - 1][0] - log[firstLoading][0]).toBe(1);
});
