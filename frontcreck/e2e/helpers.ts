import type { Locator, Page, TestInfo } from '@playwright/test';

/** Saves a viewport screenshot to test-results/shots/<project>-<name>.png and returns the path. */
export async function shot(page: Page, info: TestInfo, name: string): Promise<string> {
  const file = `test-results/shots/${info.project.name}-${name}.png`;
  await page.screenshot({ path: file });
  return file;
}

export function isPhone(info: TestInfo): boolean {
  return info.project.name === 'phone';
}

/**
 * Waits until every cover under `scope` shows its final picture: a loaded remote image, a loaded
 * sprite, or the lettered tile, fully faded in. Screenshots call this so they never catch a cover mid-load.
 */
export async function coversSettled(page: Page, scope = 'body'): Promise<void> {
  await page.waitForFunction((sel) => {
    const covers = [...document.querySelectorAll<HTMLElement>(`${sel} .cover`)];
    return covers.every((c) => {
      const s = c.dataset.state;
      if (s === 'tile') return true;
      if (s === 'sprite') return !!c.querySelector('.spr');
      const img = c.querySelector('img.ok');
      return !!img && getComputedStyle(img).opacity === '1'; // after the fade-in, too
    });
  }, scope);
}

/** Waits until the map has loaded, rendered and exposed its API, and its gas has settled: every started stop's
 * texture is in ('ready': all three on an interactive map, the one shown on Home, About and 404), or there is
 * none to wait for ('off'). After this no late texture can cost a frame inside a test's idle window. After going
 * from Home to the map without a reload, wait for the view to change before calling this. */
export async function waitForMap(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'),
    null,
    { timeout: 20_000 },
  );
}

/** Waits until no camera animation is running and the map has stopped drawing. `since` as in waitForMapQuiet. */
export async function waitForCameraIdle(page: Page, opts: { since?: number } = {}): Promise<void> {
  await page.waitForFunction(() => window.__rmr?.map && !window.__rmr.map.isAnimating(), null, { timeout: 10_000 });
  await waitForMapQuiet(page, 120, opts);
}

/** Frames the map has drawn so far (`window.__rmr.frames`). Read it before an action to pass as `since`. */
export async function mapFrames(page: Page): Promise<number> {
  return page.evaluate(() => window.__rmr?.frames ?? 0);
}

let waitCalls = 0;
/** A token unique to one helper call: in-page wait state keyed by it is never read by a later call. */
const callToken = (): string => `${Date.now()}-${++waitCalls}-${Math.random()}`;

/**
 * Waits until the map has drawn no frame for `quietMs` (cover fades and other redraws have finished).
 *
 * Each call measures its own quiet window. It keeps no "last frame seen" from an earlier call: that stamp made a
 * call after a camera move measure from the frame before the move, so it passed at once when the new frame came
 * late (slow renderer) and the test read the previous view. The window starts only after a barrier: two animation
 * frame ticks asked for at the call's start. A frame the map has already asked for (an `invalidate()` before the
 * call) runs in the same tick as the barrier or earlier, however late that tick comes, so it is drawn and counted
 * before the clock starts. When nothing draws, the call returns after the barrier plus `quietMs`.
 *
 * `since`: a frame count read before the action (mapFrames). The wait then also needs a frame after that count.
 * Pass it whenever the action must draw (a camera move, a stop change): only it rules out a frame that is asked
 * for late (after a React render or a timer) and lands after the quiet window. Never pass it when the action may
 * draw nothing, or the wait times out.
 */
export async function waitForMapQuiet(page: Page, quietMs = 200, opts: { since?: number } = {}): Promise<void> {
  await page.waitForFunction(
    ({ quiet, token, since }) => {
      type Q = { token: string; ready: boolean; f: number; t: number };
      const w = window as unknown as { __quiet?: Q };
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      const q = w.__quiet;
      if (!q || q.token !== token) {
        const fresh: Q = { token, ready: false, f, t: now };
        w.__quiet = fresh;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            fresh.ready = true;
            fresh.f = window.__rmr?.frames ?? 0;
            fresh.t = performance.now();
          }),
        );
        return false;
      }
      if (!q.ready) return false;
      if (q.f !== f) {
        q.f = f;
        q.t = now;
        return false;
      }
      if (since !== null && f <= since) return false;
      return now - q.t >= quiet;
    },
    { quiet: quietMs, token: callToken(), since: opts.since ?? null },
    { polling: 40, timeout: 15_000 },
  );
}

/** Waits until every finite CSS animation and transition on the page has finished. */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
  );
}

/** Client coordinates of an album that is on screen and not covered by another element. */
export async function visibleAlbumPoint(page: Page, from = 0, to = 600): Promise<{ id: number; x: number; y: number }> {
  const hit = await page.evaluate(
    ([a, b]) => {
      const api = window.__rmr!.map!;
      for (let id = a; id < b; id++) {
        const p = api.screenPoint(id);
        if (!p || p.x < 60 || p.y < 120 || p.x > innerWidth - 90 || p.y > innerHeight - 90) continue;
        const el = document.elementFromPoint(p.x, p.y);
        if (el && el.classList.contains('map-canvas')) return { id, x: p.x, y: p.y };
      }
      return null;
    },
    [from, to],
  );
  if (!hit) throw new Error('no visible album point');
  return hit;
}

export async function camera(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(() => window.__rmr!.map!.getCamera());
}

/** A real tap on phones and a real click on desktop. */
export async function act(target: Locator, isMobile: boolean): Promise<void> {
  if (isMobile) await target.tap();
  else await target.click();
}

/** Presses Tab until `predicate(focusedElement, arg)` holds; fails after `max` presses. The predicate runs in the
 * page, so it may use only its parameters: pass any outside value (for example a `COPY` label) as `arg`. */
export async function tabTo<A = undefined>(page: Page, predicate: (el: Element, arg: A) => boolean, max = 40, arg?: A): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(`(${predicate.toString()})(document.activeElement, ${JSON.stringify(arg ?? null)})`)) return;
  }
  throw new Error('element not reachable with Tab');
}

/** Waits until part 1's sharper gas image has settled: the flag is not 'loading', and neither it nor the frame
 * count has changed for `quietMs` (longer than GAS_SHARP_RETRY_MS, so a failed load's retry is not missed).
 * Phones say 'off'; the software test browser 'waiting' or 'off'; a desktop GPU the stop once it is in. Call it
 * before counting frames at rest. Defined in part 2 Task 0; Task 8 reuses it. */
export async function waitForGasSharpSettled(page: Page, quietMs = 2500): Promise<void> {
  // Its own window per call (a token, as in waitForMapQuiet): a stamp left by an earlier call would let this one
  // pass at once, before a stop change has even turned the flag to 'loading'.
  await page.waitForFunction(
    ({ quiet, token }) => {
      type G = { token: string; f: number; s: string; t: number };
      const w = window as unknown as { __gs?: G };
      const s = String(window.__rmr?.gasSharp);
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      const g = w.__gs;
      if (!g || g.token !== token) {
        w.__gs = { token, f, s, t: now };
        return false;
      }
      if (s === 'loading' || g.f !== f || g.s !== s) {
        g.f = f;
        g.s = s;
        g.t = now;
        return false;
      }
      return now - g.t >= quiet;
    },
    { quiet: quietMs, token: callToken() },
    { polling: 50, timeout: 45_000 },
  );
}

/** Where every album is on screen (client px), with the canvas's edges and, on a phone, the slider panel's
 * cover of the canvas bottom (MapStage's sliderCover). Percentiles use the prototype's rule. */
export interface Spread {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cover: number;
  n: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  x1: number;
  x99: number;
  medY: number;
}

export async function albumSpread(page: Page): Promise<Spread> {
  return page.evaluate(() => {
    const api = window.__rmr!.map!;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) break;
      xs.push(p.x);
      ys.push(p.y);
    }
    const r = document.querySelector('canvas.map-canvas')!.getBoundingClientRect();
    // The phone slider panel's cover of the canvas (MapStage sliderCover); Home and About have no panel, and their
    // fit keeps MapStage's fallback (PHONE_SLIDER_COVER_FALLBACK_PX, 165).
    const mode = innerWidth < 900 ? document.querySelector<HTMLElement>('.mode') : null;
    const cover = innerWidth >= 900 ? 0 : mode && mode.getClientRects().length ? Math.max(0, r.bottom - mode.getBoundingClientRect().top) : 165;
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const at = (a: number[], q: number) => a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, cover, n: xs.length, minX: xs[0], maxX: xs[xs.length - 1], minY: ys[0], maxY: ys[ys.length - 1], x1: at(xs, 0.01), x99: at(xs, 0.99), medY: at(ys, 0.5) };
  });
}

/** What is wrong with `s` as the Overview (prototype Cam.fitOverview), for a window where the span is not capped
 * (1440 x 900 and 390 x 844 at Balanced): the 1st and 99th percentile albums 24 px inside the canvas sides, the
 * median row in the middle of the canvas above the slider panel, and some albums off screen (it is a crop, not the
 * whole map). Empty when it is the Overview. Tolerance 1 px. */
export function overviewMiss(s: Spread): string[] {
  const out: string[] = [];
  const near = (a: number, b: number, what: string) => {
    if (Math.abs(a - b) > 1) out.push(`${what}: ${a.toFixed(1)} px, expected ${b.toFixed(1)}`);
  };
  near(s.x1, s.left + 24, '1st percentile x');
  near(s.x99, s.right - 24, '99th percentile x');
  near(s.medY, s.top + (s.bottom - s.cover - s.top) / 2, 'median row y');
  if (s.minX >= s.left && s.maxX <= s.right && s.minY >= s.top && s.maxY <= s.bottom) out.push('every album is on screen: that is not a crop');
  return out;
}

/** What is wrong with `s` as the Whole map: every album inside the canvas less MapStage's fit padding (desktop
 * top 55, sides 40, bottom 115; phone top 90, sides 40, bottom the slider panel plus 4), and the cloud touching the
 * padding at both ends of one axis (the fit is tight on that axis and centred). Empty when it is. Tolerance 1 px. */
export function wholeMapMiss(s: Spread, phone: boolean): string[] {
  const box = phone
    ? { l: s.left + 40, t: s.top + 90, r: s.right - 40, b: s.bottom - (s.cover + 4) }
    : { l: s.left + 40, t: s.top + 55, r: s.right - 40, b: s.bottom - 115 };
  const out: string[] = [];
  if (s.minX < box.l - 1) out.push(`an album ${(box.l - s.minX).toFixed(1)} px left of the fit box`);
  if (s.maxX > box.r + 1) out.push(`an album ${(s.maxX - box.r).toFixed(1)} px right of the fit box`);
  if (s.minY < box.t - 1) out.push(`an album ${(box.t - s.minY).toFixed(1)} px above the fit box`);
  if (s.maxY > box.b + 1) out.push(`an album ${(s.maxY - box.b).toFixed(1)} px below the fit box`);
  const tightX = Math.abs(s.minX - box.l) <= 1 && Math.abs(s.maxX - box.r) <= 1;
  const tightY = Math.abs(s.minY - box.t) <= 1 && Math.abs(s.maxY - box.b) <= 1;
  if (!tightX && !tightY) out.push(`not fitted: slack x ${(s.minX - box.l).toFixed(1)} / ${(box.r - s.maxX).toFixed(1)}, y ${(s.minY - box.t).toFixed(1)} / ${(box.b - s.maxY).toFixed(1)}`);
  return out;
}
