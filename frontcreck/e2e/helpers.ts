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

/** Waits until every finite CSS animation and transition on the page has finished. The star glints (inside
 * .tw-layer) are left out, as endless animations already are: a new one starts every 1.2 to 3 s for as long as
 * the map rests, so waiting for them would never end. */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => {
      if (a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity) return true;
      const target = (a.effect as KeyframeEffect | null)?.target;
      return target instanceof Element && target.closest('.tw-layer') !== null;
    }),
  );
}

/** Switches the star glints off for the rest of this page load, at any moment: the ones playing are removed
 * inside this call, none is made after, and no canvas frame is drawn for it (window.__rmrTwinkle, watched by
 * canvas/TwinkleDriver.tsx). A check that reads screenshot pixels while stars show calls this first: a glint is
 * a bright spot of up to 43 px at a random place and time. */
export async function twinkleOff(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__rmrTwinkle = 'off';
  });
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
    // The canvas runs under the header: the top of the map a visitor sees is the stage's, as it was the canvas's.
    const top = document.querySelector('#stage')!.getBoundingClientRect().top;
    return { left: r.left, top, right: r.right, bottom: r.bottom, cover, n: xs.length, minX: xs[0], maxX: xs[xs.length - 1], minY: ys[0], maxY: ys[ys.length - 1], x1: at(xs, 0.01), x99: at(xs, 0.99), medY: at(ys, 0.5) };
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

/**
 * WCAG contrast of the text of each selector's first visible element against what is really painted behind it.
 * axe cannot judge text over a canvas or over a see-through panel (it reports "incomplete"), so this does: the text
 * under `scope` is made transparent for one screenshot, and the background is the 95th-percentile relative
 * luminance inside the element's content box (a lone star does not decide it; a bright patch does).
 */
export async function contrastOverBackdrop(
  page: Page,
  scope: string,
  selectors: string[],
  opts: { box?: 'content' | 'text' } = {},
): Promise<Array<{ selector: string; ratio: number }>> {
  const targets = await page.evaluate(
    ([sels, box]) =>
      (sels as string[]).map((selector) => {
        const el = [...document.querySelectorAll<HTMLElement>(selector)].find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
        if (!el) return { selector, rect: null, rgb: [0, 0, 0] };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const rgb = (cs.color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        // 'text': the rectangle of the words themselves (all their lines), for a wide block with a short text.
        if (box === 'text') {
          const range = document.createRange();
          range.selectNodeContents(el);
          const t = range.getBoundingClientRect();
          return { selector, rect: { x: t.x, y: t.y, w: t.width, h: t.height }, rgb };
        }
        // The content box, where the text is set: not the element's own border (on a small bordered chip, a mood
        // tag, the border line alone is more than 5 % of the box and would be measured in place of the background)
        // and not its padding (the map hint's top padding is the clear end of its band, with no text on it).
        const px = (v: string) => parseFloat(v) || 0;
        const l = Math.ceil(px(cs.borderLeftWidth)) + px(cs.paddingLeft);
        const t = Math.ceil(px(cs.borderTopWidth)) + px(cs.paddingTop);
        const w = r.width - l - Math.ceil(px(cs.borderRightWidth)) - px(cs.paddingRight);
        const h = r.height - t - Math.ceil(px(cs.borderBottomWidth)) - px(cs.paddingBottom);
        return { selector, rect: { x: r.x + l, y: r.y + t, w, h }, rgb };
      }),
    [selectors, opts.box ?? 'content'] as const,
  );
  const missing = targets.filter((t) => !t.rect).map((t) => t.selector);
  if (missing.length) throw new Error(`contrastOverBackdrop: not visible: ${missing.join(', ')}`);
  // Never a sliver: a rectangle that is empty, or cut by the edge of the screenshot, is not what was asked for.
  const view = page.viewportSize()!;
  const cut = targets.filter((t) => t.rect!.w < 1 || t.rect!.h < 1 || t.rect!.x < -0.5 || t.rect!.y < -0.5 || t.rect!.x + t.rect!.w > view.width + 0.5 || t.rect!.y + t.rect!.h > view.height + 0.5);
  if (cut.length) throw new Error(`contrastOverBackdrop: empty or outside the viewport: ${cut.map((t) => `${t.selector} ${JSON.stringify(t.rect)}`).join(', ')}`);
  const style = await page.addStyleTag({
    content: `${scope}, ${scope} * { color: transparent !important; -webkit-text-fill-color: transparent !important; -webkit-text-stroke-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; transition: none !important; }`,
  });
  const png = (await page.screenshot()).toString('base64');
  await style.evaluate((el) => (el as Element).remove());
  return page.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return list.map((t) => {
        const x0 = Math.max(0, Math.ceil(t.rect!.x * k));
        const y0 = Math.max(0, Math.ceil(t.rect!.y * k));
        const x1 = Math.min(img.width, Math.floor((t.rect!.x + t.rect!.w) * k));
        const y1 = Math.min(img.height, Math.floor((t.rect!.y + t.rect!.h) * k));
        if (x1 <= x0 || y1 <= y0) throw new Error(`contrastOverBackdrop: no pixel inside ${t.selector}`);
        const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        const lums: number[] = [];
        for (let i = 0; i < d.length; i += 4) lums.push(lum(d[i], d[i + 1], d[i + 2]));
        lums.sort((a, b) => a - b);
        const bg = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.95))];
        const fg = lum(t.rgb[0], t.rgb[1], t.rgb[2]);
        return { selector: t.selector, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) };
      });
    },
    [png, targets] as const,
  );
}

/** The WebGL vendor and renderer of this browser ("... SwiftShader ..." in the default suite, "... ANGLE Metal
 * Renderer: Apple M1 Pro ..." under E2E_GPU=1): printed by the tests that measure painted gas, so a log says where
 * its numbers were measured. */
export async function glRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? `${gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)} | ${gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)}` : 'unknown';
  });
}

/**
 * Pans the map so that the brightest gas on screen lies under the words of `target` (the window of the size of
 * its text with the highest mean luminance, found with `hide` hidden), and waits for the map to settle. For
 * contrast checks of text that sits straight on the nebula. `target` may also be a rectangle in client px.
 *
 * Returns the mean luminance (0 to 1) of the gas that is under the words AFTER the pan, read from a second
 * screenshot with `hide` hidden: the camera is clamped to the cloud (state/bounds.ts), so a pan can stop short,
 * and the brightness found before the pan would then describe gas that never arrived. Throws when less than 0.8 of
 * the brightness found has arrived; assert on the return value that it is gas at all.
 */
export async function panBrightestGasUnder(
  page: Page,
  target: string | { x: number; y: number; width: number; height: number },
  hide = '.map-ui, header.top',
): Promise<number> {
  const selector = typeof target === 'string' ? target : `a ${target.width} x ${target.height} px rectangle`;
  /** A screenshot without `hide`, and in the page: the words' rectangle and what `pick` makes of the pixels. */
  const look = async (mode: 'find' | 'under'): Promise<{ dx: number; dy: number; m: number }> => {
    const style = await page.addStyleTag({ content: `${hide} { visibility: hidden !important; }` });
    const png = (await page.screenshot()).toString('base64');
    await style.evaluate((el) => (el as Element).remove());
    return page.evaluate(
      async ([data, where, how]) => {
        let t: { x: number; y: number; width: number; height: number };
        if (typeof where === 'string') {
          const range = document.createRange();
          range.selectNodeContents(document.querySelector(where)!);
          t = range.getBoundingClientRect();
        } else t = where;
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const k = img.width / innerWidth;
        const d = ctx.getImageData(0, 0, img.width, img.height).data;
        const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        const lum = (i: number) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
        const w = Math.floor(t.width * k);
        const h = Math.floor(t.height * k);
        const mean = (x: number, y: number) => {
          let sum = 0;
          let n = 0;
          for (let j = 0; j < h; j += 4) for (let i = 0; i < w; i += 6, n++) sum += lum(((y + j) * img.width + x + i) * 4);
          return sum / n;
        };
        if (how === 'under') {
          const x = Math.max(0, Math.min(img.width - w, Math.round(t.x * k)));
          const y = Math.max(0, Math.min(img.height - h, Math.round(t.y * k)));
          return { dx: 0, dy: 0, m: mean(x, y) };
        }
        let best = { m: -1, x: 0, y: 0 };
        for (let y = 0; y + h <= img.height; y += 6) {
          for (let x = 0; x + w <= img.width; x += 10) {
            const m = mean(x, y);
            if (m > best.m) best = { m, x: x / k, y: y / k };
          }
        }
        // panBy: positive dx moves the view right (the gas left), positive dy moves the view up (the gas down).
        return { dx: best.x - t.x, dy: t.y - best.y, m: best.m };
      },
      [png, target, mode] as const,
    );
  };
  const move = await look('find');
  // Already there (less than a pixel to go): nothing would draw, and waiting for a frame would time out.
  if (Math.abs(move.dx) >= 1 || Math.abs(move.dy) >= 1) {
    const since = await mapFrames(page);
    await page.evaluate(([dx, dy]) => window.__rmr!.map!.panBy(dx, dy), [move.dx, move.dy]);
    await waitForMapQuiet(page, 200, { since });
  }
  const under = (await look('under')).m;
  // A pan that stopped short is an error here, not a number for the caller to interpret.
  if (under < 0.8 * move.m) throw new Error(`panBrightestGasUnder: the pan stopped short under ${selector}: gas of luminance ${move.m.toFixed(3)} was found, ${under.toFixed(3)} arrived`);
  return under;
}
