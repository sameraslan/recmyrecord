import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { NAME_OFFSETS, luminance, nameContrast } from '../src/components/map/state/namesLayout';
import { COPY } from '../src/lib/copy';
import { act, camera, mapFrames, shot, twinkleOff, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

/**
 * The region names in a browser (part 2 Task 9): which show, where, when, and what they cost. Plain lettering
 * over the map, placed by canvas/RegionNamesDriver.tsx through state/namesPlacer.ts.
 *
 * The rules these tests hold the names to are written here as numbers, not imported from the product, so that a
 * change of the product's constant fails a test: at most 17 names on a desktop and 4 on a phone, none once covers
 * are 13 px, none beside an open album, 10 px inside the map, 22 px clear of a picked album, 4.5:1, a rest
 * placement 150 ms after the last step of a held key, and at most 2.5 s of waiting for the first gas image. Only
 * the list of nudges (NAME_OFFSETS) and the contrast formula are the product's own.
 *
 * What e2e/toggle.spec.ts already proves about the names button is not repeated here: its place, size and glass,
 * its one fixed label and pressed state, the saved choice across reloads with no hydration error, its Tab order
 * on every view, that it survives client-side moves, and that two presses beside an open album draw no frame.
 * e2e/a11y.spec.ts runs axe on /map with the names on.
 */

/** A region name the driver has placed. */
const SHOWN = '.rn:not(.off)';
const FIRST_IMAGE = /\/data\/theme\/gas-(sonic|balanced|mood)\.[0-9a-f]{10}\.webp$/;
const BALANCED_IMAGE = /\/data\/theme\/gas-balanced\.[0-9a-f]{10}\.webp$/;
const LATE_IMAGE = /\/data\/theme\/gas-(sonic|mood)\.[0-9a-f]{10}\.webp$/;
const THEME_JSON = /\/data\/theme\/theme\.json$/;

/** One shown name, as the page has it. */
interface NameRead {
  /** `<stop>:<name>`: ids repeat across stops. */
  key: string;
  stop: string;
  name: string;
  /** Centre of the name's element, client px. */
  cx: number;
  cy: number;
  /** The centre less its label's point on screen (the label's raw point through the albums' own projection). */
  dx: number;
  dy: number;
  /** Which of NAME_OFFSETS (dx, dy) is, within 1 px; -1 when none. */
  spot: number;
  /** The letters' box (`b`): left, top, right, bottom, client px. */
  box: [number, number, number, number];
  halo: number;
  alpha: number;
  font: number;
  fair: boolean;
  moved: boolean;
  ink: number[];
}
/** A name shown ('on') or hidden ('off') by the driver. */
interface Flip {
  what: 'on' | 'off';
  key: string;
  t: number;
  frames: number;
  /** The frame count up to 50 ms earlier: equal to `frames` when no map frame was drawn for this. */
  beatFrames: number;
  /** First gas images (2048 px) uploaded by then. */
  uploads: number;
  /** Animation frame ticks since the first gas upload began. */
  ticks: number;
  /** The gas has chosen its shader, which it does when its first stop settles (image in, or given up). */
  shaderChosen: boolean;
  animating: boolean | null;
  /** The camera at that moment. */
  cam: { x: number; y: number; zoom: number } | null;
  inRaf: boolean;
  batch: number;
}
/** A class or style write on a name. */
interface NameWrite {
  t: number;
  frames: number;
  batch: number;
  key: string;
  attr: string;
  inRaf: boolean;
}
interface Sample {
  frames: number;
  t: number;
  fading: boolean;
  names: NameRead[];
}
interface Nm {
  uploads: number;
  shownInFirstUpload: number | null;
  framesAtUpload: number | null;
  uploadAt: number | null;
  ticks: number;
  layerAt: number | null;
  flips: Flip[];
  writes: NameWrite[];
  beat: { t: number; frames: number };
  inRaf: number;
  undimmed: { t: number; frames: number; uploads: number } | null;
  autoToggle: boolean;
  toggled: { shown: number; uploads: number; sinceLayer: number; layerBack: boolean } | null;
  geo: { pos: Record<string, number[]>; labels: Record<string, { name: string; x: number; y: number }[]> } | null;
  samples: Sample[];
  prepare: () => Promise<void>;
  read: () => NameRead[];
  watch: (on: boolean) => void;
}
type W = Window & typeof globalThis & { __nm: Nm };

/**
 * What every test's page carries from its first script on (`window.__nm`): a count of the first gas images'
 * uploads (wrapped as e2e/gas.spec.ts wraps them: the only 2048 px ImageBitmaps handed to WebGL) with how many
 * names showed inside the first of those calls; a record of every name shown or hidden and of every class or
 * style write on a name, each stamped with the frame count and with whether it was written inside an animation
 * frame callback (a map frame) or outside one (a rest placement, a timer); and a reader of the shown names
 * against their labels' points, which it projects with the albums' own screen points, so no camera maths is
 * repeated here.
 */
function installProbe({ offsets }: { offsets: number[][] }): void {
  const frames = (): number => window.__rmr?.frames ?? 0;
  const nm: Nm = {
    uploads: 0,
    shownInFirstUpload: null,
    framesAtUpload: null,
    uploadAt: null,
    ticks: 0,
    layerAt: null,
    flips: [],
    writes: [],
    beat: { t: 0, frames: 0 },
    inRaf: 0,
    undimmed: null,
    autoToggle: false,
    toggled: null,
    geo: null,
    samples: [],
    prepare: async () => {
      if (nm.geo) return;
      const [pos, theme] = await Promise.all([fetch('/data/positions.json').then((r) => r.json()), fetch('/data/theme/theme.json').then((r) => r.json())]);
      nm.geo = { pos, labels: theme.labels };
    },
    read: () => {
      const geo = nm.geo;
      const api = window.__rmr?.map;
      const stop = window.__rmr?.getState().stop ?? 'balanced';
      let ax = 0;
      let bx = 0;
      let ay = 0;
      let by = 0;
      if (geo && api) {
        // screen = a * raw + b on each axis, from the albums furthest apart on that axis at this stop.
        const arr = geo.pos[stop];
        let x0 = 0;
        let x1 = 0;
        let y0 = 0;
        let y1 = 0;
        for (let i = 0; i < arr.length / 2; i++) {
          if (arr[2 * i] < arr[2 * x0]) x0 = i;
          if (arr[2 * i] > arr[2 * x1]) x1 = i;
          if (arr[2 * i + 1] < arr[2 * y0 + 1]) y0 = i;
          if (arr[2 * i + 1] > arr[2 * y1 + 1]) y1 = i;
        }
        const p0 = api.screenPoint(x0)!;
        const p1 = api.screenPoint(x1)!;
        const q0 = api.screenPoint(y0)!;
        const q1 = api.screenPoint(y1)!;
        ax = (p1.x - p0.x) / (arr[2 * x1] - arr[2 * x0]);
        bx = p0.x - ax * arr[2 * x0];
        ay = (q1.y - q0.y) / (arr[2 * y1 + 1] - arr[2 * y0 + 1]);
        by = q0.y - ay * arr[2 * y0 + 1];
      }
      return [...document.querySelectorAll<HTMLElement>('.rn-layer .rn:not(.off)')].map((el) => {
        const r = el.getBoundingClientRect();
        const b = el.querySelector('b')!.getBoundingClientRect();
        const name = el.textContent ?? '';
        const own = el.dataset.stop ?? '';
        const label = geo?.labels[own]?.find((l) => l.name === name);
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = label ? cx - (ax * label.x + bx) : NaN;
        const dy = label ? cy - (ay * label.y + by) : NaN;
        return {
          key: `${own}:${name}`,
          stop: own,
          name,
          cx,
          cy,
          dx,
          dy,
          spot: offsets.findIndex((o) => Math.abs(dx - o[0]) <= 1 && Math.abs(dy - o[1]) <= 1),
          box: [b.left, b.top, b.right, b.bottom] as [number, number, number, number],
          halo: parseFloat(el.style.getPropertyValue('--h')),
          alpha: parseFloat(el.style.getPropertyValue('--a')),
          font: parseFloat(el.style.fontSize),
          fair: el.classList.contains('fair'),
          moved: el.classList.contains('moved'),
          ink: (el.style.getPropertyValue('--lc').match(/[\d.]+/g) ?? []).map(Number),
        };
      });
    },
    // One sample of the shown names after every drawn map frame: the frame counter's write queues it, so it
    // runs when the frame's callbacks have all returned and before anything else can move the camera.
    watch: (on) => {
      const o = window.__rmr as unknown as { frames?: number };
      if (!on) {
        const v = o.frames;
        delete o.frames;
        o.frames = v;
        return;
      }
      let v = o.frames ?? 0;
      nm.samples = [];
      Object.defineProperty(o, 'frames', {
        configurable: true,
        enumerable: true,
        get: () => v,
        set: (n: number) => {
          v = n;
          queueMicrotask(() => nm.samples.push({ frames: v, t: performance.now(), fading: !!document.querySelector('.rn-layer.is-fading'), names: nm.read() }));
        },
      });
    },
  };
  (window as unknown as { __nm: Nm }).__nm = nm;
  setInterval(() => {
    nm.beat = { t: performance.now(), frames: frames() };
  }, 50);

  // Inside an animation frame callback, and until the microtasks it queued have run (a MutationObserver's among
  // them), nm.inRaf is above 0.
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    raf((ts) => {
      nm.inRaf += 1;
      try {
        cb(ts);
      } finally {
        queueMicrotask(() => {
          nm.inRaf -= 1;
        });
      }
    });

  const P = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const fn of ['texImage2D', 'texSubImage2D']) {
    const orig = P[fn];
    P[fn] = function (this: unknown, ...a: unknown[]) {
      const src = a[a.length - 1];
      if (src instanceof ImageBitmap && Math.max(src.width, src.height) === 2048) {
        if (nm.uploads === 0) {
          nm.shownInFirstUpload = document.querySelectorAll('.rn-layer .rn:not(.off)').length;
          nm.framesAtUpload = frames();
          nm.uploadAt = performance.now();
          const tick = (): void => {
            nm.ticks += 1;
            if (nm.ticks < 600) raf(tick);
          };
          raf(tick);
        }
        nm.uploads += 1;
      }
      return orig.apply(this, a);
    };
  }

  let batch = 0;
  const has = (cls: string, word: string): boolean => cls.split(/\s+/).includes(word);
  new MutationObserver((recs) => {
    batch += 1;
    const now = performance.now();
    if (nm.layerAt === null && document.querySelector('.rn-layer')) nm.layerAt = now;
    if (nm.autoToggle && nm.toggled === null && nm.layerAt !== null) {
      // The names button and the names are both up and the first gas image is not: off, then on, at once.
      const button = (): HTMLElement | null => document.querySelector<HTMLElement>('.map-zoom .map-names');
      if (button()) {
        nm.toggled = { shown: -1, uploads: -1, sinceLayer: -1, layerBack: false };
        button()!.click();
        raf(() => {
          button()?.click();
          raf(() =>
            raf(() => {
              nm.toggled = {
                shown: document.querySelectorAll('.rn-layer .rn:not(.off)').length,
                uploads: nm.uploads,
                sinceLayer: performance.now() - (nm.layerAt ?? 0),
                layerBack: !!document.querySelector('.rn-layer'),
              };
            }),
          );
        });
      }
    }
    const f = frames();
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (r.type !== 'attributes') continue;
      const el = r.target as HTMLElement;
      if (!el.classList) continue;
      if (r.attributeName === 'class' && el.classList.contains('map-pane')) {
        if (has(r.oldValue ?? '', 'is-dimmed') && !el.classList.contains('is-dimmed')) nm.undimmed = { t: now, frames: f, uploads: nm.uploads };
        continue;
      }
      if (!el.classList.contains('rn')) continue;
      const key = `${el.dataset.stop}:${el.textContent}`;
      const inRaf = nm.inRaf > 0;
      nm.writes.push({ t: now, frames: f, batch, key, attr: r.attributeName ?? '', inRaf });
      if (r.attributeName !== 'class') continue;
      // What the class became at this write: what the next write on the same name found, or what it is now.
      let next = el.className;
      for (let j = i + 1; j < recs.length; j++) {
        if (recs[j].target === el && recs[j].attributeName === 'class') {
          next = recs[j].oldValue ?? '';
          break;
        }
      }
      const was = has(r.oldValue ?? '', 'off');
      const is = has(next, 'off');
      if (was === is) continue;
      nm.flips.push({
        what: is ? 'off' : 'on',
        key,
        t: now,
        frames: f,
        beatFrames: nm.beat.frames,
        uploads: nm.uploads,
        ticks: nm.ticks,
        shaderChosen: typeof window.__rmr?.gasLite === 'boolean',
        animating: window.__rmr?.map ? window.__rmr.map.isAnimating() : null,
        cam: window.__rmr?.map ? window.__rmr.map.getCamera() : null,
        inRaf,
        batch,
      });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true });
}

// The test browser renders in software, where the app would draw the gas with its lighter shader. This spec reads
// gas pixels under the names and saves pictures for the owner, so every page draws the full shader, as a GPU does
// (the same init script as e2e/gas.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await page.addInitScript(installProbe, { offsets: NAME_OFFSETS.map((o) => [o[0], o[1]]) });
});

/** The star glints (part 2 Task 8) are bright spots at random places and times: off wherever a test reads pixels
 * or counts what happens at rest. */
async function stillSky(page: Page): Promise<void> {
  await twinkleOff(page);
}

/** The lettering face has arrived, the names have been measured again with it, and the map is still. */
async function settle(page: Page, names = true): Promise<void> {
  await waitForMap(page);
  await waitForCameraIdle(page);
  if (names) {
    await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await page.waitForFunction(() => {
      const layer = document.querySelector('.rn-layer');
      return !!layer && document.fonts.check(`400 16px ${getComputedStyle(layer).fontFamily.split(',')[0]}`);
    });
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await waitForMapQuiet(page, 300);
  await page.evaluate(() => (window as unknown as W).__nm.prepare());
}

/** Opens /map at the Overview (the opening view), or at the Whole map (the fit) with `whole`. Names are read and
 * the toggle is used only after this: the names flag is `true` before the map's chunk loads whatever is saved. */
async function openMap(page: Page, opts: { whole?: boolean; names?: boolean } = {}): Promise<void> {
  if (opts.whole) {
    await page.addInitScript(() => {
      window.__rmrOpen = 'whole';
    });
  }
  await page.goto('/map');
  await settle(page, opts.names ?? true);
}

const read = (page: Page): Promise<NameRead[]> => page.evaluate(() => (window as unknown as W).__nm.read());
const toggle = (page: Page) => page.getByRole('button', { name: COPY.map.names, exact: true });
const fit = (page: Page) => page.getByRole('button', { name: COPY.map.reset, exact: true });
const state = (page: Page) =>
  page.evaluate(() => {
    const n = (window as unknown as W).__nm;
    return {
      uploads: n.uploads,
      shownInFirstUpload: n.shownInFirstUpload,
      framesAtUpload: n.framesAtUpload,
      uploadAt: n.uploadAt,
      layerAt: n.layerAt,
      flips: n.flips,
      undimmed: n.undimmed,
      toggled: n.toggled,
      now: performance.now(),
      frames: window.__rmr?.frames ?? 0,
    };
  });

const told = (names: NameRead[]): string => names.map((n) => `${n.name} spot ${n.spot} at ${n.cx.toFixed(1)}, ${n.cy.toFixed(1)} h ${n.halo}`).join(' | ');

/** Every name sits on one of its label's spots: its own point or one of the twelve nudges (78 px at most). */
function expectOnSpots(names: NameRead[], when: string): void {
  for (const n of names) {
    expect(n.spot, `${when}: "${n.name}" is ${n.dx.toFixed(1)}, ${n.dy.toFixed(1)} px from its label's point, which is none of its spots`).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(n.dx, n.dy), `${when}: "${n.name}" within 78 px of its label's point`).toBeLessThanOrEqual(79);
  }
}

/** The same names in the same places with the same halos. */
function expectSameNames(got: NameRead[], want: NameRead[], when: string): void {
  const by = (list: NameRead[]) => [...list].sort((a, b) => (a.key < b.key ? -1 : 1));
  expect(by(got).map((n) => n.key), `${when}: the names. GOT ${told(got)}. WANT ${told(want)}`).toEqual(by(want).map((n) => n.key));
  for (const g of got) {
    const w = want.find((n) => n.key === g.key)!;
    expect(Math.hypot(g.cx - w.cx, g.cy - w.cy), `${when}: "${g.name}" at ${g.cx.toFixed(1)}, ${g.cy.toFixed(1)} against ${w.cx.toFixed(1)}, ${w.cy.toFixed(1)}`).toBeLessThanOrEqual(1);
    expect(g.halo, `${when}: the halo of "${g.name}"`).toBe(w.halo);
    expect(g.spot, `${when}: the spot of "${g.name}"`).toBe(w.spot);
  }
}

type Rect = { left: number; top: number; right: number; bottom: number };
const touches = (b: [number, number, number, number], k: Rect): boolean => b[0] < k.right && b[2] > k.left && b[1] < k.bottom && b[3] > k.top;

/** The map's controls that are on screen, and the part of the pane that shows the map (below the header, and on
 * a phone above the slider panel). */
async function chrome(page: Page): Promise<{ rects: Array<Rect & { what: string }>; map: Rect }> {
  return page.evaluate(() => {
    const out: Array<{ left: number; top: number; right: number; bottom: number; what: string }> = [];
    const seen = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    for (const what of ['header.top', '.mode', '.map-zoom', '.map-pane .card']) {
      const el = document.querySelector(what);
      if (!seen(el)) continue;
      const r = el.getBoundingClientRect();
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, what });
    }
    // The hint is a full-width band with its words in the corner: the words are what a name must keep off.
    const hint = document.querySelector('.map-hint');
    if (seen(hint)) {
      const range = document.createRange();
      range.selectNodeContents(hint);
      const r = range.getBoundingClientRect();
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, what: '.map-hint words' });
    }
    const pane = document.querySelector('.map-pane')!.getBoundingClientRect();
    const header = document.querySelector('header.top')?.getBoundingClientRect();
    const mode = innerWidth < 900 ? document.querySelector('.mode')?.getBoundingClientRect() : undefined;
    return { rects: out, map: { left: pane.left, top: Math.max(pane.top, header?.bottom ?? 0), right: pane.right, bottom: mode ? mode.top : pane.bottom } };
  });
}

/** No two names touch, none touches a control, and every one is at least 10 px inside the map. */
async function expectClear(page: Page, names: NameRead[], when: string): Promise<void> {
  const { rects, map } = await chrome(page);
  for (let i = 0; i < names.length; i++) {
    const a = names[i];
    for (let j = i + 1; j < names.length; j++) {
      const b = names[j].box;
      expect(touches(a.box, { left: b[0], top: b[1], right: b[2], bottom: b[3] }), `${when}: "${a.name}" over "${names[j].name}"`).toBe(false);
    }
    for (const k of rects) expect(touches(a.box, k), `${when}: "${a.name}" over ${k.what}`).toBe(false);
    expect(a.box[0], `${when}: "${a.name}" from the left edge`).toBeGreaterThanOrEqual(map.left + 10);
    expect(a.box[2], `${when}: "${a.name}" from the right edge`).toBeLessThanOrEqual(map.right - 10);
    expect(a.box[1], `${when}: "${a.name}" below the header`).toBeGreaterThanOrEqual(map.top + 10);
    expect(a.box[3], `${when}: "${a.name}" from the bottom`).toBeLessThanOrEqual(map.bottom - 10);
  }
}

/** Points on the canvas with no album within `clear` px, the emptiest first and at least 40 px apart (a drag
 * from one never ends on a hover, and a pointer resting on one hovers nothing). */
async function emptyPoints(page: Page, clear = 14, most = 1): Promise<{ x: number; y: number }[]> {
  return page.evaluate(
    ([need, max]) => {
      const api = window.__rmr!.map!;
      const pts: { x: number; y: number }[] = [];
      for (let id = 0; ; id++) {
        const p = api.screenPoint(id);
        if (!p) break;
        pts.push(p);
      }
      const free: { x: number; y: number; d: number }[] = [];
      for (let y = 220; y <= innerHeight - 220; y += 10) {
        for (let x = 320; x <= innerWidth - 320; x += 10) {
          let d = Infinity;
          for (const p of pts) {
            d = Math.min(d, Math.max(Math.abs(p.x - x), Math.abs(p.y - y)));
            if (d < need) break;
          }
          if (d >= need && document.elementFromPoint(x, y)?.classList.contains('map-canvas')) free.push({ x, y, d });
        }
      }
      free.sort((p, q) => q.d - p.d || p.y - q.y || p.x - q.x);
      const out: { x: number; y: number }[] = [];
      for (const f of free) {
        if (out.length >= max) break;
        if (out.every((o) => Math.max(Math.abs(o.x - f.x), Math.abs(o.y - f.y)) >= 40)) out.push({ x: f.x, y: f.y });
      }
      return out;
    },
    [clear, most] as const,
  );
}

async function emptyPoint(page: Page, clear = 14): Promise<{ x: number; y: number }> {
  const [hit] = await emptyPoints(page, clear, 1);
  if (!hit) throw new Error('no empty point on the map');
  return hit;
}

/** The files of the names' lettering face (Tenor Sans): every `src` of the @font-face rules of the family that
 * `--font-names-face` names. The stylesheet is the site's one, so this reads the same on every page. */
async function nameFaceFiles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-names-face').split(',')[0].trim().replace(/["']/g, '');
    const out: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...rules]) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        if (rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim() !== family) continue;
        for (const m of rule.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/g)) out.push(new URL(m[1], sheet.href ?? location.href).pathname);
      }
    }
    return out;
  });
}

/** Records the path of every font file the page asks for. */
function watchFonts(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (/\.woff2?(\?|$)/.test(r.url())) asked.push(new URL(r.url()).pathname);
  });
  return asked;
}

// ---------------------------------------------------------------------------------------------------------------
// The opening: names and the first gas image
// ---------------------------------------------------------------------------------------------------------------

test('no region name shows before the first gas image is uploaded, and none goes off again while the map opens', async ({ page }) => {
  // The bug this pins (bisected in part 2): 17 haloed names rasterised in the map's first frame held the first
  // gas upload back by a fifth of a second. No time is measured: inside the first upload call itself no name
  // may be showing, and no name may have been shown before it.
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const s = await state(page);
  expect(s.uploads, 'first gas images uploaded').toBeGreaterThanOrEqual(1);
  expect(s.shownInFirstUpload, 'names showing inside the first gas upload call').toBe(0);
  const shown = s.flips.filter((f) => f.what === 'on');
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.filter((f) => f.uploads === 0).map((f) => f.key), 'names shown before the first gas upload').toEqual([]);
  // Shown once, and never taken away again on the way to the settled map (a name shown in the map's first frame
  // and hidden when the gas begins to load would show here).
  expect(s.flips.filter((f) => f.what === 'off').map((f) => f.key), 'names hidden again while the map opened').toEqual([]);
});

test('the names arrive with the one frame the first gas image asks for', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const s = await state(page);
  const first = s.flips.find((f) => f.what === 'on')!;
  expect(first.inRaf, 'the names were placed by a map frame').toBe(true);
  expect(first.ticks, 'animation frames between the upload and the names').toBeLessThanOrEqual(1);
  expect(first.frames - s.framesAtUpload!, 'map frames between the upload and the names').toBeLessThanOrEqual(1);
});

test('a first gas image that fails still lets the names show, with the frame that settles it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the wait for the gas is the same code on a phone; desktop framing');
  // The Balanced image is refused; the other two stops are held back so that neither can stand in for it.
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(BALANCED_IMAGE, async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ status: 404, body: '' });
  });
  await page.route(LATE_IMAGE, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/map');
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const s = await state(page);
  const first = s.flips.find((f) => f.what === 'on')!;
  expect(s.uploads, 'no gas image was uploaded').toBe(0);
  expect(first.shaderChosen, 'the names showed once the failed stop was settled, not before').toBe(true);
  // By the frame the settled stop asked for, not by the 2.5 s bound (which places them with no frame).
  expect(first.inRaf, 'placed by a map frame').toBe(true);
  release();
  await waitForMap(page);
  expect((await state(page)).flips.filter((f) => f.what === 'off')).toEqual([]);
});

test('a slow first gas image is given up on after 2.5 s: the names show with no map frame, and stay when the nebula arrives', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the wait for the gas is the same code on a phone; desktop framing');
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(FIRST_IMAGE, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/map');
  // The names give up 2.5 s after the gas began to load. The gas begins when the map mounts, as the names' layer
  // does, so the time is taken from the layer: not before 2.0 s (0.5 s to spare for the order of the two mounts)
  // and, generously for a loaded machine, by 8 s.
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 12_000 }).toBeGreaterThan(0);
  const s = await state(page);
  const first = s.flips.find((f) => f.what === 'on')!;
  expect(s.uploads, 'the image is still held').toBe(0);
  expect(first.uploads).toBe(0);
  expect(first.t - s.layerAt!, 'ms from the names layer to the first name').toBeGreaterThanOrEqual(2000);
  expect(first.t - s.layerAt!, 'ms from the names layer to the first name').toBeLessThanOrEqual(8000);
  // Placed from the timer: outside any frame, and no map frame was drawn for it or after it.
  expect(first.inRaf, 'placed outside a map frame').toBe(false);
  expect(first.frames, 'no map frame in the 50 ms before the names').toBe(first.beatFrames);
  await page.waitForTimeout(400);
  expect(await mapFrames(page), 'no map frame after the names').toBe(first.frames);
  const before = await read(page);
  release();
  await waitForMap(page);
  await waitForCameraIdle(page);
  const after = await state(page);
  expect(after.uploads, 'the nebula arrived').toBeGreaterThanOrEqual(1);
  expect(after.flips.filter((f) => f.what === 'off').map((f) => f.key), 'names hidden when the nebula arrived').toEqual([]);
  expect((await read(page)).map((n) => n.key).sort()).toEqual(before.map((n) => n.key).sort());
});

test('switching the names off and on before the first gas image does not show them early', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the wait for the gas is the same code on a phone; desktop framing');
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(FIRST_IMAGE, async (route) => {
    await held;
    await route.continue();
  });
  // The page itself presses the names button twice as soon as it is there (off, then on a frame later): the
  // presses then land long before the 2.5 s bound whatever the machine's load.
  await page.addInitScript(() => {
    (window as unknown as W).__nm.autoToggle = true;
  });
  await page.goto('/map');
  await page.waitForFunction(() => ((window as unknown as W).__nm.toggled?.shown ?? -1) >= 0, null, { timeout: 20_000 });
  const s = await state(page);
  expect(s.toggled!.layerBack, 'the names layer is back after off and on').toBe(true);
  expect(s.toggled!.uploads, 'the image is still held').toBe(0);
  expect(s.toggled!.sinceLayer, 'ms from the first names layer to the second press, well inside the 2.5 s wait').toBeLessThan(2000);
  expect(s.toggled!.shown, 'names showing after off and on, before the gas').toBe(0);
  release();
  await waitForMap(page);
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  // Every name was shown by the upload, or by the bound running out (not before 2.0 s).
  const end = await state(page);
  const early = end.flips.filter((f) => f.what === 'on' && f.uploads === 0 && f.t - end.layerAt! < 2000);
  expect(early.map((f) => `${f.key} at ${Math.round(f.t - end.layerAt!)} ms`), 'names shown before the gas and before the bound').toEqual([]);
});

test('from Home to the map with the gas already in, the names show with the first frames of the map, without a wait', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the wait for the gas is the same code on a phone; desktop framing');
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect(page.locator(SHOWN)).toHaveCount(0);
  const home = await state(page);
  expect(home.uploads, 'the gas is in on Home').toBeGreaterThanOrEqual(1);
  await page.getByRole('link', { name: COPY.home.explore }).click();
  await expect(page).toHaveURL('/map');
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  const s = await state(page);
  const first = s.flips.find((f) => f.what === 'on')!;
  expect(s.undimmed, 'the map pane stopped being the dimmed backdrop').not.toBeNull();
  // The gas was in, so nothing was waited for: within three map frames of the pane no longer being dimmed (one
  // for the map to hear of it, one to place), and far sooner than the 2.5 s bound could have shown them.
  expect(first.uploads, 'the gas was in when the names showed').toBeGreaterThanOrEqual(1);
  expect(first.frames - s.undimmed!.frames, 'map frames from the undimmed pane to the first name').toBeLessThanOrEqual(3);
  expect(first.t - s.undimmed!.t, 'ms from the undimmed pane to the first name: far under the 2.5 s bound').toBeLessThan(2000);
});

// ---------------------------------------------------------------------------------------------------------------
// Which names, and where
// ---------------------------------------------------------------------------------------------------------------

test('at the Overview and at the Whole map the names are the slider stop\'s own, each on one of its label\'s spots: 1 to 17 on a desktop, more at the Whole map, never more than four on a phone', async ({ page, isMobile }) => {
  await openMap(page);
  const overview = await read(page);
  expectOnSpots(overview, 'Overview');
  expect(new Set(overview.map((n) => n.stop)), 'Overview: every name is of the Balanced stop').toEqual(new Set(['balanced']));
  expect(new Set(overview.map((n) => n.key)).size).toBe(overview.length);
  expect(overview.length).toBeGreaterThanOrEqual(1);
  expect(overview.length, `Overview: ${told(overview)}`).toBeLessThanOrEqual(isMobile ? 4 : 17);
  // The Whole map, by the fit button.
  const since = await mapFrames(page);
  await act(fit(page), isMobile);
  await waitForCameraIdle(page, { since });
  await waitForMapQuiet(page, 300);
  const whole = await read(page);
  expectOnSpots(whole, 'Whole map');
  expect(new Set(whole.map((n) => n.stop)), 'Whole map: every name is of the Balanced stop').toEqual(new Set(['balanced']));
  expect(whole.length).toBeGreaterThanOrEqual(1);
  expect(whole.length, `Whole map: ${told(whole)}`).toBeLessThanOrEqual(isMobile ? 4 : 17);
  if (!isMobile) expect(whole.length, 'more names at the Whole map than at the Overview').toBeGreaterThan(overview.length);
});

test('no two names touch, none touches the header, the slider, the zoom corner or the hint, and every one is 10 px inside the map', async ({ page, isMobile }) => {
  await openMap(page);
  await expectClear(page, await read(page), 'Overview');
  const since = await mapFrames(page);
  await act(fit(page), isMobile);
  await waitForCameraIdle(page, { since });
  await waitForMapQuiet(page, 300);
  await expectClear(page, await read(page), 'Whole map');
});

test('the names are plain lettering: hidden from assistive technology, nothing to focus or click, wide Tenor capitals, and a drag that starts on a name pans the map', async ({ page, isMobile }) => {
  await openMap(page);
  const layer = page.locator('.rn-layer');
  await expect(layer).toHaveAttribute('aria-hidden', 'true');
  expect(await layer.evaluate((el) => el.querySelectorAll('a, button, input, select, textarea, [tabindex], [role], [title], [aria-label]').length)).toBe(0);
  expect(await layer.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  const centres = await page.locator(SHOWN).evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, events: getComputedStyle(e).pointerEvents, onName: !!top?.closest('.rn-layer'), onCanvas: !!top?.classList.contains('map-canvas') };
    }),
  );
  expect(centres.length).toBeGreaterThan(0);
  expect(centres.filter((c) => c.onName || c.events !== 'none')).toEqual([]);
  // Wide capitals in Tenor Sans; on a phone 13 to 16 px.
  const style = await page.locator(`${SHOWN} b`).evaluateAll((els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return { transform: cs.textTransform, tenor: /tenor/i.test(cs.fontFamily.split(',')[0]) && document.fonts.check(`400 16px ${cs.fontFamily.split(',')[0]}`), size: parseFloat(cs.fontSize), track: parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize) };
    }),
  );
  for (const s of style) {
    expect(s.transform).toBe('uppercase');
    expect(s.tenor).toBe(true);
    expect(s.track).toBeCloseTo(0.26, 2);
    if (isMobile) {
      expect(s.size).toBeGreaterThanOrEqual(13);
      expect(s.size).toBeLessThanOrEqual(16);
    }
  }
  if (isMobile) return;
  // Tab from the slider's last stop goes to the map's buttons, never into the names.
  await page.locator('.mode-stops button').last().focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.rn-layer'))).toBe(false);
  // A drag that starts on a name pans the map under it.
  const start = centres.find((c) => c.onCanvas)!;
  const before = await camera(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40, { steps: 6 });
  await page.mouse.up();
  await waitForCameraIdle(page);
  expect((await camera(page)).x).toBeLessThan(before.x);
});

test('no name is closer than 22 px to the album picked in Explore, and none is under its card', async ({ page }) => {
  await openMap(page);
  // An album that sits under a shown name's letters.
  const pick = await page.evaluate(() => {
    const api = window.__rmr!.map!;
    const boxes = (window as unknown as W).__nm.read().map((n) => ({ name: n.name, box: n.box }));
    for (let id = 0; ; id++) {
      const p = api.screenPoint(id);
      if (!p) return null;
      const under = boxes.find((b) => p.x > b.box[0] + 4 && p.x < b.box[2] - 4 && p.y > b.box[1] + 2 && p.y < b.box[3] - 2);
      if (under) return { id, name: under.name };
    }
  });
  expect(pick, 'an album under a name').not.toBeNull();
  const since = await mapFrames(page);
  await page.evaluate((id) => window.__rmr!.getState().setSelected(id), pick!.id);
  await expect(page.locator('.card')).toBeVisible();
  await waitForMapQuiet(page, 300, { since });
  const at = (await page.evaluate((id) => window.__rmr!.map!.screenPoint(id), pick!.id))!;
  const names = await read(page);
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) {
    expect(touches(n.box, { left: at.x - 22, top: at.y - 22, right: at.x + 22, bottom: at.y + 22 }), `"${n.name}" within 22 px of the picked album (it was under "${pick!.name}")`).toBe(false);
  }
  expectOnSpots(names, 'with an album picked');
  await expectClear(page, names, 'with an album picked');
});

// ---------------------------------------------------------------------------------------------------------------
// When they show
// ---------------------------------------------------------------------------------------------------------------

test('no names once covers are 13 px, names just under that, and they return at the Overview', async ({ page, isMobile }) => {
  await openMap(page);
  const overview = await read(page);
  if (!isMobile) {
    // The boundary from both sides, by setting the camera: covers of 12.9 px and of 13.1 px. A cover is 0.0068
    // world units and the canvas shows 1.1 world units of height at zoom 1.
    const height = await page.evaluate(() => document.querySelector('canvas.map-canvas')!.getBoundingClientRect().height);
    const zoomFor = (coverPx: number) => (coverPx / 0.0068) * (1.1 / height);
    const cam = await camera(page);
    for (const [px, some] of [[12.9, true], [13.1, false], [12.9, true]] as const) {
      const since = await mapFrames(page);
      await page.evaluate(([c, z]) => window.__rmr!.map!.setCamera({ x: c.x, y: c.y, zoom: z }, false), [cam, zoomFor(px)] as const);
      await waitForMapQuiet(page, 200, { since });
      const n = await page.locator(SHOWN).count();
      if (some) expect(n, `names with ${px} px covers`).toBeGreaterThan(0);
      else expect(n, `names with ${px} px covers`).toBe(0);
    }
  }
  // By the keyboard, as a visitor zooms: eight steps of 1.4 (14.8 times) put covers over 13 px on both projects,
  // from the Overview and from the Whole map alike.
  await page.locator('canvas.map-canvas').focus();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect(page.locator(SHOWN)).toHaveCount(0);
  // Off is off at once: hidden, not fading with the map (the 0.2 s fade is the browser's, on a hidden element).
  await page.waitForTimeout(250);
  expect(await page.locator('.rn').evaluateAll((els) => els.filter((e) => getComputedStyle(e).visibility !== 'hidden').length)).toBe(0);
  // Back out: '0' fits the whole cloud.
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  await expect.poll(() => page.locator(SHOWN).count()).toBeGreaterThan(0);
  if (isMobile) expect(await page.locator(SHOWN).count()).toBeLessThanOrEqual(4);
  expect(overview.length).toBeGreaterThan(0);
});

test('no names beside an open album, from the moment its panel takes its place and at any zoom, and they return when it closes', async ({ page, isMobile }) => {
  await openMap(page);
  const overview = await camera(page);
  // Open an album from Explore: pick one, then its card's action.
  const id = await page.evaluate(() => {
    const api = window.__rmr!.map!;
    for (let i = 0; ; i++) {
      const p = api.screenPoint(i);
      if (!p) return -1;
      if (p.x > innerWidth * 0.3 && p.x < innerWidth * 0.7 && p.y > innerHeight * 0.3 && p.y < innerHeight * 0.6) return i;
    }
  });
  await page.evaluate((i) => window.__rmr!.getState().setSelected(i), id);
  await expect(page.locator('.card')).toBeVisible();
  await waitForMapQuiet(page, 300);
  const start = (await state(page)).flips.length;
  await act(page.locator('.card').getByRole('link', { name: COPY.map.cardPrimary }), isMobile);
  await expect(page).toHaveURL(/\/album\//);
  if (isMobile) await page.getByRole('button', { name: COPY.phone.mapLabel }).tap(); // the phone's map mode
  await expect(page.locator(SHOWN)).toHaveCount(0);
  await waitForMap(page);
  await waitForCameraIdle(page);
  if (!isMobile) {
    // Gone when the panel took its place, with the camera still on its way to the album: not once it arrived.
    const settled = await camera(page);
    const offs = (await state(page)).flips.slice(start).filter((f) => f.what === 'off');
    expect(offs.length).toBeGreaterThan(0);
    expect(offs.filter((f) => !f.cam || Math.abs(f.cam.zoom / settled.zoom - 1) < 0.02).map((f) => f.key), 'names hidden only once the camera had arrived at the album').toEqual([]);
  }
  // Zoom out with the album still open until the map is as far out as the Overview, where names would show.
  for (let i = 0; i < 6; i++) {
    await act(page.getByRole('button', { name: COPY.map.zoomOut }), isMobile);
    await waitForCameraIdle(page);
    expect(await page.locator(SHOWN).count(), `names after ${i + 1} steps out`).toBe(0);
  }
  expect((await camera(page)).zoom).toBeLessThanOrEqual(overview.zoom * 1.3);
  expect(await page.evaluate(() => window.__rmr!.getState().focus !== null)).toBe(true);
  // The names are on (the button says so); it is the open album that hides them.
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  // At rest beside the album the map draws nothing, names or no names.
  await waitForGasSharpSettled(page);
  await stillSky(page);
  const f0 = await mapFrames(page);
  await page.waitForTimeout(1500);
  expect((await mapFrames(page)) - f0, 'map frames in 1.5 s at rest beside an open album').toBe(0);
  if (isMobile) return;
  // Close: the names come back and ride the map while the panel slides away, each on one of its spots in every
  // frame.
  await page.evaluate(() => (window as unknown as W).__nm.watch(true));
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await waitForCameraIdle(page);
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await waitForMapQuiet(page, 300);
  const ride = await page.evaluate(() => {
    const nm = (window as unknown as W).__nm;
    nm.watch(false);
    return { frames: nm.samples.length, withNames: nm.samples.filter((s) => s.names.length > 0).length, off: nm.samples.flatMap((s) => s.names.filter((n) => n.spot < 0).map((n) => `${n.name} ${n.dx.toFixed(1)}, ${n.dy.toFixed(1)} at frame ${s.frames}`)) };
  });
  expect(ride.withNames, 'frames with names while the panel slid away').toBeGreaterThan(0);
  expect(ride.off, 'names off their spots in a frame of the close').toEqual([]);
  expectOnSpots(await read(page), 'after the album closed');
});

test('the slider swaps one stop\'s names for the other\'s: never both at once, full halos on the way, and the same names as before on the way back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the morph is the same code on a phone; sampled per frame on desktop');
  await openMap(page);
  const balanced = await read(page);
  expect(balanced.some((n) => n.halo < 1), 'at rest on the Overview some name has a solved, lighter halo').toBe(true);
  const morph = async (to: 'mood' | 'balanced') => {
    await page.evaluate(() => (window as unknown as W).__nm.watch(true));
    const since = await mapFrames(page);
    await page.evaluate((stop) => window.__rmr!.getState().setStop(stop), to);
    await expect.poll(() => page.locator(`${SHOWN}[data-stop="${to}"]`).count(), { timeout: 10_000 }).toBeGreaterThan(0);
    await waitForCameraIdle(page, { since });
    await waitForMapQuiet(page, 300);
    return page.evaluate(() => {
      const nm = (window as unknown as W).__nm;
      nm.watch(false);
      return nm.samples.map((s) => ({ frames: s.frames, fading: s.fading, stops: [...new Set(s.names.map((n) => n.stop))], alphas: s.names.map((n) => n.alpha), halos: s.names.map((n) => n.halo) }));
    });
  };
  const there = await morph('mood');
  expect(there.length).toBeGreaterThan(0);
  // Frame by frame: one stop's names at most; Balanced, then none, then Mood, never back; between the stops the
  // letters are faded (--a under 1) under a full halo.
  let phase = 0;
  for (const s of there) {
    expect(s.stops.length, `frame ${s.frames}: names of ${s.stops.join(' and ')}`).toBeLessThanOrEqual(1);
    const now = s.stops[0] === 'balanced' ? 0 : s.stops.length === 0 ? 1 : 2;
    expect(s.stops[0] ?? 'mood', `frame ${s.frames}`).toMatch(/^(balanced|mood)$/);
    expect(now, `frame ${s.frames}: ${s.stops[0] ?? 'no'} names after phase ${phase}`).toBeGreaterThanOrEqual(phase);
    phase = now;
    if (s.fading) {
      for (const a of s.alphas) expect(a, `frame ${s.frames}: a fading name's --a`).toBeLessThanOrEqual(1);
      for (const h of s.halos) expect(h, `frame ${s.frames}: a fading name's halo`).toBe(1);
    }
  }
  expect(there.some((s) => s.fading), 'frames in which the names were fading').toBe(true);
  expect(there.some((s) => s.fading && s.alphas.some((a) => a < 1)), 'frames with letters part faded (--a under 1)').toBe(true);
  const mood = await read(page);
  expect(new Set(mood.map((n) => n.stop))).toEqual(new Set(['mood']));
  for (const n of mood) expect(n.alpha, `"${n.name}" --a at rest`).toBe(1);
  await expect(page.locator('.rn-layer')).not.toHaveClass(/is-fading/);
  await expect(page.locator(`${SHOWN}:not([data-stop="mood"])`)).toHaveCount(0);
  expectOnSpots(mood, 'at Mood');
  // And back: the view rests on exactly the names it had, where it had them, with their solved halos.
  await morph('balanced');
  expectSameNames(await read(page), balanced, 'back at Balanced');
});

test('the dimmed map behind Home, About and the 404 shows no names and does not fetch their lettering face; the map fetches it once, without a preload', async ({ page }) => {
  const asked = watchFonts(page);
  for (const path of ['/', '/about', '/no-such-page']) {
    await page.goto(path);
    await waitForMap(page);
    await waitForCameraIdle(page);
    await expect(page.locator(SHOWN), path).toHaveCount(0);
    await expect(page.locator('.rn-layer'), path).toBeHidden();
    expect(await page.locator('.rn-layer').evaluate((el) => getComputedStyle(el).display), path).toBe('none');
  }
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const files = await nameFaceFiles(page);
  expect(files.length, 'files of the names face in the stylesheet').toBeGreaterThan(0);
  expect(asked.filter((a) => files.includes(a)), 'the names face fetched behind Home, About or the 404').toEqual([]);
  expect(await page.evaluate((list) => [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')].filter((l) => list.includes(new URL(l.href).pathname)).length, files)).toBe(0);
  await openMap(page);
  expect(asked.filter((a) => files.includes(a)).length, 'fetches of the names face on the map').toBe(1);
  expect(await page.evaluate((list) => [...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')].filter((l) => list.includes(new URL(l.href).pathname)).length, files)).toBe(0);
});

test('with the saved choice off the map loads with no names layer, never fetches the lettering face, and draws nothing at rest', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      if (window.localStorage.getItem('rmr-names') === null) window.localStorage.setItem('rmr-names', '0');
    } catch {
      // storage blocked: the test below fails on the layer
    }
  });
  const asked = watchFonts(page);
  await openMap(page, { names: false });
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rn-layer')).toHaveCount(0);
  await expect(page.locator('.rn')).toHaveCount(0);
  const files = await nameFaceFiles(page);
  expect(files.length).toBeGreaterThan(0);
  expect(asked.filter((a) => files.includes(a))).toEqual([]);
  await waitForGasSharpSettled(page);
  await stillSky(page);
  const f0 = await mapFrames(page);
  await page.waitForTimeout(1500);
  expect((await mapFrames(page)) - f0).toBe(0);
  expect((await state(page)).flips, 'no name was ever shown').toEqual([]);
});

test('names that arrive late, with the theme data, show without any input from the visitor', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same code on a phone');
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(THEME_JSON, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/map');
  // The map is up with plain sky and no names (its gas flag is not settled without the theme, so waitForMap
  // would not return).
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20_000 });
  await waitForCameraIdle(page);
  await expect(page.locator('.rn-layer')).toHaveCount(0);
  release();
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  await settle(page);
  const names = await read(page);
  expectOnSpots(names, 'after the theme arrived');
  await expectClear(page, names, 'after the theme arrived');
});

test('a lettering face that arrives late: the names show at once in the fallback face, and when the face arrives they are measured again with no map frame', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same code on a phone');
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let heldBack = 0;
  // Which woff2 is the names' is known only from the stylesheet: the handler asks the page.
  let files: string[] | null = null;
  await page.route(/\.woff2(\?|$)/, async (route) => {
    if (!files?.length) files = await nameFaceFiles(page).catch(() => null);
    if (files?.includes(new URL(route.request().url()).pathname)) {
      heldBack += 1;
      await held;
    }
    await route.continue();
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await expect.poll(() => page.locator(SHOWN).count(), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(heldBack, 'the names face is asked for and held').toBe(1);
  const tenor = () =>
    page.evaluate(() => {
      const layer = document.querySelector('.rn-layer')!;
      return document.fonts.check(`400 16px ${getComputedStyle(layer).fontFamily.split(',')[0]}`);
    });
  expect(await tenor(), 'the face has not arrived').toBe(false);
  await page.evaluate(() => (window as unknown as W).__nm.prepare());
  await waitForGasSharpSettled(page);
  await stillSky(page);
  const before = await read(page);
  expectOnSpots(before, 'in the fallback face');
  const widths = async () => Object.fromEntries((await read(page)).map((n) => [n.key, n.box[2] - n.box[0]]));
  const w0 = await widths();
  const f0 = await mapFrames(page);
  const writes0 = await page.evaluate(() => (window as unknown as W).__nm.writes.length);
  release();
  await expect.poll(tenor, { timeout: 15_000 }).toBe(true);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))));
  await page.waitForTimeout(400);
  expect((await mapFrames(page)) - f0, 'map frames drawn for the arriving face').toBe(0);
  const after = await read(page);
  const w1 = await widths();
  expect(after.filter((n) => n.key in w0 && Math.abs(w1[n.key] - w0[n.key]) > 0.5).length, 'names whose letters changed width with the face').toBeGreaterThan(0);
  // Laid out again with the new widths: still apart, still on their spots.
  expectOnSpots(after, 'in the arrived face');
  await expectClear(page, after, 'in the arrived face');
  const late = await page.evaluate((from) => (window as unknown as W).__nm.writes.slice(from), writes0);
  expect(late.filter((w) => w.inRaf).length, 'writes on names inside a map frame after the face arrived').toBe(0);
});

// ---------------------------------------------------------------------------------------------------------------
// What they cost: frames, and the pointer
// ---------------------------------------------------------------------------------------------------------------

test('with names on the map draws no frame at rest (3 s)', async ({ page }) => {
  await openMap(page);
  // Part 1's sharper gas image may fade in about a second after the map settles (desktops with a real GPU): wait.
  await waitForGasSharpSettled(page);
  await stillSky(page);
  expect(await page.locator(SHOWN).count()).toBeGreaterThan(0);
  const f0 = await mapFrames(page);
  const w0 = await page.evaluate(() => (window as unknown as W).__nm.writes.length);
  await page.waitForTimeout(3000); // nothing should happen: the idle window in which the map must not draw
  expect((await mapFrames(page)) - f0, 'map frames in 3 s at rest').toBe(0);
  expect((await page.evaluate(() => (window as unknown as W).__nm.writes.length)) - w0, 'writes on names in 3 s at rest').toBe(0);
});

test('a press of the names button draws no map frame either way: off removes the layer, on brings back the same names in the same places', async ({ page, isMobile }, info) => {
  await openMap(page);
  await waitForGasSharpSettled(page);
  await stillSky(page);
  const before = await read(page);
  await shot(page, info, 'names-toggle-on');
  // The pointer rests on the button first, so the press itself moves nothing over the map.
  if (!isMobile) {
    const box = (await toggle(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await waitForMapQuiet(page, 300);
  }
  const f0 = await mapFrames(page);
  await act(toggle(page), isMobile);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.rn-layer')).toHaveCount(0);
  await expect(page.locator('.rn')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect((await mapFrames(page)) - f0, 'map frames for names off').toBe(0);
  await shot(page, info, 'names-toggle-off');
  await act(toggle(page), isMobile);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator(SHOWN).count()).toBe(before.length);
  await page.waitForTimeout(500);
  expect((await mapFrames(page)) - f0, 'map frames for names off and on').toBe(0);
  expectSameNames(await read(page), before, 'after off and on');
  if (isMobile) return;
  // And by the keyboard: Enter takes the names away, Space brings them back.
  await toggle(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.rn')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect.poll(() => page.locator(SHOWN).count()).toBe(before.length);
  expectSameNames(await read(page), before, 'after off and on by the keyboard');
});

test('moving the pointer over the map with names on writes nothing in the names layer, and a pointer move draws the one frame it draws with names off', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no hover on a phone');
  test.setTimeout(120_000);
  await openMap(page);
  await waitForGasSharpSettled(page);
  await stillSky(page);
  // Twenty albums across the map, clear of the controls, and twenty points with no album near.
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
  const free = await emptyPoints(page, 12, 21);
  expect(free.length, 'points with no album within 12 px').toBe(21);
  const empty = free.slice(0, 20);
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
    const w = window as unknown as { __layerChanges: number };
    w.__layerChanges = 0;
    new MutationObserver((r) => (w.__layerChanges += r.length)).observe(document.querySelector('.rn-layer')!, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  // Over albums: the hover changes with every move, and nothing in the names layer does. (How many frames a
  // hover draws depends on whether its 80 ms label timer falls into a frame already asked for, so those frames
  // are bounded here, not compared: the move, the change of hover, the label.)
  const over = await walk(albums);
  expect(over.hovers, 'moves that ended on an album').toBeGreaterThan(5);
  for (const n of over.frames) expect(n, `frames for a move onto an album (${over.frames.join(', ')})`).toBeLessThanOrEqual(3);
  // Over empty map: a move that changes no hover is one frame (the pointer's), names on or names off.
  const on = await walk(empty);
  expect(on.hovers, 'moves over empty map that hovered an album').toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __layerChanges: number }).__layerChanges), 'changes in the names layer over 40 pointer moves').toBe(0);
  await toggle(page).click();
  await expect(page.locator('.rn-layer')).toHaveCount(0);
  const off = await walk(empty);
  expect(off.frames, 'frames per pointer move with names off').toEqual(empty.map(() => 1));
  expect(on.frames, 'frames per pointer move, names on against names off').toEqual(off.frames);
});

test('during a wheel zoom and a drag every shown name is on one of its label\'s spots in every drawn frame, and names stay on throughout', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse gestures');
  await openMap(page);
  const at = await emptyPoint(page);
  const sampled = async (gesture: () => Promise<void>) => {
    await page.evaluate(() => (window as unknown as W).__nm.watch(true));
    await gesture();
    await waitForCameraIdle(page);
    return page.evaluate(() => {
      const nm = (window as unknown as W).__nm;
      nm.watch(false);
      return {
        frames: nm.samples.length,
        fewest: Math.min(...nm.samples.map((s) => s.names.length)),
        off: nm.samples.flatMap((s) => s.names.filter((n) => n.spot < 0).map((n) => `${n.name} ${n.dx.toFixed(1)}, ${n.dy.toFixed(1)} at frame ${s.frames}`)),
      };
    });
  };
  // A wheel zoom out and back in, inside the names' band.
  await page.mouse.move(at.x, at.y);
  const wheel = await sampled(async () => {
    for (const dy of [120, 120, 120, -120, -120, -120]) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(60);
    }
  });
  expect(wheel.frames, 'frames in the wheel zoom').toBeGreaterThan(5);
  expect(wheel.off, 'names off their spots in a frame of the wheel zoom').toEqual([]);
  expect(wheel.fewest, 'fewest names in a frame of the wheel zoom').toBeGreaterThan(0);
  const drag = await sampled(async () => {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x - 260, at.y + 120, { steps: 24 });
    await page.mouse.up();
  });
  expect(drag.frames, 'frames in the drag').toBeGreaterThan(5);
  expect(drag.off, 'names off their spots in a frame of the drag').toEqual([]);
  expect(drag.fewest, 'fewest names in a frame of the drag').toBeGreaterThan(0);
});

/** The gestures of the rest tests below, found by trying each on the committed theme at 1440 x 900 from the Overview:
 * each leaves at least one name on a nudge that the rest placement then changes. */
const DRAG: readonly [number, number] = [-260, 120];
const KEY_RUN: readonly [string, number] = ['ArrowLeft', 4];
const WHEEL_RUN: readonly [number, number] = [120, 3];

/** The animations and transitions still running on a name, after two animation frame ticks (an animation ends
 * on a tick: one that reduced motion has cut to nothing is over by then). */
async function runningOnNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    return document
      .getAnimations()
      .filter((a) => a.playState === 'running' && (a.effect as KeyframeEffect | null)?.target?.closest?.('.rn-layer'))
      .map((a) => `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty} on ${(a.effect as KeyframeEffect).target?.textContent}`);
  });
}

/** A drag from an empty point by (dx, dy), held still at its end. */
async function dragAndHold(page: Page, dx: number, dy: number): Promise<{ x: number; y: number }> {
  const at = await emptyPoint(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + dx, at.y + dy, { steps: 16 });
  await waitForMapQuiet(page, 300);
  // Held longer than a fling may follow from: the release then starts no glide.
  await page.waitForTimeout(300);
  return at;
}

test('releasing a drag puts the names on their rest spots with no map frame, and the fade mark is gone 0.4 s later', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse gestures');
  await openMap(page);
  await waitForGasSharpSettled(page);
  await stillSky(page);
  await dragAndHold(page, DRAG[0], DRAG[1]);
  const held = await read(page);
  const f0 = await mapFrames(page);
  const w0 = await page.evaluate(() => (window as unknown as W).__nm.writes.length);
  const releasedAt = await page.evaluate(() => {
    (window as unknown as W).__nm.watch(true);
    return performance.now();
  });
  await page.mouse.up();
  // The rest placement runs when the release's task is over: two animation frame ticks are far more than that,
  // and a frame it had asked for would have been drawn in the first of them.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const rested = await read(page);
  const writes = await page.evaluate((from) => (window as unknown as W).__nm.writes.slice(from), w0);
  expect((await mapFrames(page)) - f0, 'map frames drawn by the release').toBe(0);
  const moved = rested.filter((n) => {
    const was = held.find((h) => h.key === n.key);
    return !!was && was.spot !== n.spot;
  });
  expect(moved.length, `names that took another spot at rest. HELD ${told(held)}. RESTED ${told(rested)}`).toBeGreaterThan(0);
  expect(writes.filter((w) => w.attr === 'style').length, 'style writes on names at the release').toBeGreaterThan(0);
  expect(writes.filter((w) => w.inRaf).length, 'writes on names inside a map frame at the release').toBe(0);
  expectOnSpots(rested, 'at rest after the drag');
  await expectClear(page, rested, 'at rest after the drag');
  // A name that was showing and took another spot fades in there (opacity only): marked while it does.
  expect(writes.filter((w) => w.attr === 'class' && moved.some((m) => m.key === w.key)).length, 'class writes on the names that moved').toBeGreaterThan(0);
  // 0.25 s of fade; 0.4 s later the mark is gone (looked for until 1.4 s, for a loaded machine).
  await page.waitForTimeout(400);
  await expect(page.locator('.rn.moved')).toHaveCount(0, { timeout: 1000 });
  await page.waitForTimeout(900);
  // Afterwards the map is at rest. The one frame it may draw is not the names': the camera's bounds check
  // (canvas/CameraBounds.tsx) wakes one frame 520 ms after every release, names or no names. Nothing earlier
  // than 400 ms after the release, nothing more than that one, and it writes nothing on a name.
  const later = await page.evaluate((from) => {
    const nm = (window as unknown as W).__nm;
    nm.watch(false);
    return { frames: nm.samples.map((s) => Math.round(s.t - from.at)), writes: nm.writes.slice(from.w).filter((w) => w.inRaf).length };
  }, { at: releasedAt, w: w0 });
  expect(later.frames.filter((ms) => ms < 400), 'ms after the release of the frames drawn before the bounds check').toEqual([]);
  expect(later.frames.length, `map frames in the 1.3 s after the release (at ${later.frames.join(', ')} ms)`).toBeLessThanOrEqual(1);
  expect(later.writes, 'writes on names inside a map frame after the release').toBe(0);
  expectSameNames(await read(page), rested, 'a second after the release');
});

/** What a run of camera steps that set no motion flag did to the names: `steps` key presses or wheel notches 30 ms
 * apart, sent by the page itself (so a slow test runner cannot stretch the gaps), then the wait for the rest. */
async function stepRun(page: Page, kind: 'key' | 'wheel', arg: string | number, steps: number) {
  return page.evaluate(
    async ([how, what, count]) => {
      const nm = (window as unknown as W).__nm;
      const canvas = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!;
      const r = canvas.getBoundingClientRect();
      const start = nm.read();
      const w0 = nm.writes.length;
      nm.watch(true);
      const firstAt = performance.now();
      await new Promise<void>((done) => {
        let i = 0;
        const id = setInterval(() => {
          if (how === 'key') canvas.dispatchEvent(new KeyboardEvent('keydown', { key: String(what), bubbles: true, cancelable: true }));
          else canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: Number(what), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
          if (++i >= count) {
            clearInterval(id);
            done();
          }
        }, 30);
      });
      const lastAt = performance.now();
      // The rest placement: the first style write on a name outside a map frame after the last step.
      const rest = () => nm.writes.slice(w0).find((w) => w.t >= lastAt && !w.inRaf && w.attr === 'style');
      const t0 = performance.now();
      while (!rest() && performance.now() - t0 < 4000) await new Promise((res) => setTimeout(res, 20));
      const first = rest() ?? null;
      // Was the last step's frame drawn before the rest placement? (If not, it is still to come.)
      const drawnBefore = !!first && nm.samples.some((s) => s.t > lastAt && s.t < first.t);
      await new Promise((res) => setTimeout(res, 700));
      nm.watch(false);
      const until = first ? first.t : Infinity;
      // The spots each name had: at the start, then in every drawn frame until the rest placement.
      const during: Record<string, number[]> = {};
      for (const n of start) during[n.key] = [n.spot];
      for (const s of nm.samples) {
        if (s.t >= until) continue;
        for (const n of s.names) {
          const list = (during[n.key] ??= []);
          if (!list.includes(n.spot)) list.push(n.spot);
        }
      }
      const writes = nm.writes.slice(w0);
      return {
        start,
        end: nm.read(),
        during,
        frames: nm.samples.filter((s) => s.t < until).length,
        restAfterMs: first ? first.t - lastAt : null,
        restInRaf: first ? first.inRaf : null,
        // Frames from the rest placement until 400 ms after the last step. (520 ms after the last step the
        // camera's bounds check wakes one frame, names or no names: canvas/CameraBounds.tsx.)
        framesAfterRest: first ? nm.samples.filter((s) => s.t > first.t && s.t < lastAt + 400).length : null,
        framesLater: nm.samples.filter((s) => s.t >= lastAt + 400).length,
        drawnBefore,
        // Style writes outside a frame from the first step until the rest placement: there must be none.
        early: writes.filter((w) => w.t >= firstAt && w.t < until && !w.inRaf && w.attr === 'style').length,
        restBatches: [...new Set(writes.filter((w) => w.t >= lastAt && !w.inRaf && w.attr === 'style').map((w) => w.batch))].length,
      };
    },
    [kind, arg, steps] as const,
  );
}

type StepRun = Awaited<ReturnType<typeof stepRun>>;

/** The names kept their spots through the run (see below for the one exception), then took their rest spots in
 * one batch outside any frame, not before 150 ms after the last step, and no map frame was drawn for it. */
function expectHeldThenRested(run: StepRun, what: string): void {
  expect(run.frames, `${what}: frames drawn during the run`).toBeGreaterThanOrEqual(2);
  // The names the rest placement moved: on another spot at rest than in the last frame of the run. While the
  // steps ran each of them was on the spot it started on, in every frame: none was put on its rest spot early.
  // (A moving map may move a name whose own spot gets blocked, in whichever frame that happens to be drawn; such
  // a name is not held to its spot here, and the rest placement must still find at least one name to settle.)
  const settled = run.end.filter((n) => {
    const spots = run.during[n.key];
    return !!spots && spots[spots.length - 1] !== n.spot;
  });
  expect(settled.length, `${what}: names that took another spot at rest (the run must leave some to settle, or this proves nothing). DURING ${JSON.stringify(run.during)}. END ${told(run.end)}`).toBeGreaterThan(0);
  expect(settled.filter((n) => run.during[n.key].length > 1).map((n) => `${n.key}: spots ${run.during[n.key].join(', ')}`), `${what}: names that changed spot while the steps ran and again at rest`).toEqual([]);
  expect(run.early, `${what}: names written outside a frame before the rest`).toBe(0);
  expect(run.restAfterMs, `${what}: a rest placement came`).not.toBeNull();
  // 150 ms after the last step. A timer is never early; 140 allows for the clock's own steps. Late is the
  // machine's load: the bound is 4 s.
  expect(run.restAfterMs!, `${what}: ms from the last step to the rest placement`).toBeGreaterThanOrEqual(140);
  expect(run.restInRaf, `${what}: the rest placement was made inside a map frame`).toBe(false);
  expect(run.restBatches, `${what}: batches of rest writes`).toBe(1);
  // No frame for it: none at all when the last step's frame was already drawn, and only that one when it was not
  // (a frame the placement asked for would be drawn at once). Later, the bounds check's one frame at most.
  expect(run.framesAfterRest!, `${what}: map frames between the rest placement and 400 ms after the last step`).toBeLessThanOrEqual(run.drawnBefore ? 0 : 1);
  expect(run.framesLater, `${what}: map frames from 400 ms after the last step on`).toBeLessThanOrEqual(1);
  expectOnSpots(run.end, `${what}: at rest`);
}

test('a held arrow key: no name is put on its rest spot while the key repeats, then one rest placement 150 ms after the last step with no map frame', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard');
  await openMap(page);
  await waitForGasSharpSettled(page);
  await stillSky(page);
  const run = await stepRun(page, 'key', KEY_RUN[0], KEY_RUN[1]);
  expectHeldThenRested(run, `${KEY_RUN[1]} steps of ${KEY_RUN[0]}`);
  await expectClear(page, await read(page), 'at rest after the held key');
  await expect(page.locator('.rn.moved')).toHaveCount(0, { timeout: 1400 });
});

test('a wheel under reduced motion is a run of steps too: spots kept while it turns, one rest placement after, and no running animation on any name', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse wheel');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  await waitForGasSharpSettled(page);
  await stillSky(page);
  const run = await stepRun(page, 'wheel', WHEEL_RUN[0], WHEEL_RUN[1]);
  expectHeldThenRested(run, `${WHEEL_RUN[1]} wheel notches of ${WHEEL_RUN[0]}`);
  await page.waitForTimeout(400);
  expect(await runningOnNames(page), 'running animations or transitions on names').toEqual([]);
});

test('a window made narrower than 900 px and wide again: at most four names while narrow, and the same names in the same places as before once it is back, with no reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desktop window');
  await openMap(page);
  await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
  const wide = await read(page);
  expect(wide.length).toBeGreaterThan(4);
  const resized = async (w: number, h: number) => {
    const since = await mapFrames(page);
    await page.setViewportSize({ width: w, height: h });
    await waitForCameraIdle(page, { since });
    // A resize is a run of steps for the names: the rest placement comes 150 ms after its last frame.
    await page.waitForTimeout(500);
    await waitForMapQuiet(page, 300);
    return read(page);
  };
  const narrow = await resized(880, 900);
  expect(narrow.length, `names in a window 880 px wide: ${told(narrow)}`).toBeLessThanOrEqual(4);
  expect(narrow.length).toBeGreaterThan(0);
  expectOnSpots(narrow, 'narrow');
  await expectClear(page, narrow, 'narrow');
  const back = await resized(1440, 900);
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  // The camera keeps the visitor's view through a resize, so the view may differ from the one the page opened
  // on. What must hold: the names are a rest placement of this view (each on a spot, apart, clear), there are
  // more than four again, none is left marked as fading, and the map is at rest.
  expect(back.length, `names back at 1440 px: ${told(back)}`).toBeGreaterThan(4);
  expectOnSpots(back, 'wide again');
  await expectClear(page, back, 'wide again');
  await expect(page.locator('.rn.moved')).toHaveCount(0, { timeout: 1400 });
  const f0 = await mapFrames(page);
  await page.waitForTimeout(800);
  expect((await mapFrames(page)) - f0, 'map frames at rest after the resize').toBe(0);
  expectSameNames(await read(page), back, 'at rest after the resize');
});

test('after the map is dragged far off and reins itself in, the names sit on their labels\' spots and nothing is left fading', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse gestures');
  await openMap(page);
  const at = await emptyPoint(page);
  // Three long drags to the right: the cloud goes mostly off screen and the bounds pull it back on release.
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(at.x - 300, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 420, at.y + 60, { steps: 10 });
    await page.waitForTimeout(250);
    await page.mouse.up();
  }
  await waitForCameraIdle(page);
  await page.waitForTimeout(500);
  await waitForMapQuiet(page, 300);
  const names = await read(page);
  expect(names.length).toBeGreaterThan(0);
  expectOnSpots(names, 'after the rein-in');
  await expectClear(page, names, 'after the rein-in');
  await expect(page.locator('.rn.moved')).toHaveCount(0, { timeout: 1400 });
});

// ---------------------------------------------------------------------------------------------------------------
// The Whole map is one placement, however it was reached
// ---------------------------------------------------------------------------------------------------------------

for (const [w, h] of [[1440, 790], [1366, 768], [1440, 900], [1600, 1000]] as const) {
  test(`${w} x ${h}: the Whole map reached by the fit button shows the same names, in the same places, with the same halos as the Whole map opened directly`, async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'desktop windows');
    await page.setViewportSize({ width: w, height: h });
    await openMap(page);
    const since = await mapFrames(page);
    await fit(page).click();
    await waitForCameraIdle(page, { since });
    await page.waitForTimeout(500);
    await waitForMapQuiet(page, 300);
    const pressed = await read(page);
    // 0.4 s after the map came to rest no name is still marked as fading.
    await expect(page.locator('.rn.moved')).toHaveCount(0, { timeout: 1000 });
    const direct = await context.newPage();
    await direct.setViewportSize({ width: w, height: h });
    await direct.addInitScript(() => {
      window.__rmrGasLite = 'off';
    });
    await direct.addInitScript(installProbe, { offsets: NAME_OFFSETS.map((o) => [o[0], o[1]]) });
    await openMap(direct, { whole: true });
    const cold = await read(direct);
    expect(Math.abs((await camera(page)).zoom / (await camera(direct)).zoom - 1), 'the two cameras are the same view').toBeLessThan(1e-3);
    expect(cold.length).toBeGreaterThan(0);
    expectSameNames(pressed, cold, `${w} x ${h}, fit button against direct`);
    expectOnSpots(pressed, `${w} x ${h}`);
    await direct.close();
  });
}

test('under reduced motion a fit press leaves no name with a running animation or transition', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMap(page);
  const since = await mapFrames(page);
  await fit(page).click();
  await waitForCameraIdle(page, { since });
  await page.waitForTimeout(400);
  expect(await runningOnNames(page), 'running animations or transitions on names').toEqual([]);
  await expect(page.locator('.rn.moved')).toHaveCount(0);
  expectOnSpots(await read(page), 'Whole map under reduced motion');
});

// ---------------------------------------------------------------------------------------------------------------
// Contrast, from pixels
// ---------------------------------------------------------------------------------------------------------------

/**
 * For every shown name: the gas and stars really on screen under its letters (their box and 8 px round it, read
 * from a screenshot with the names layer hidden), and the halo painted round them (the pixels 2 to 3 px outside
 * the letters themselves, read from a screenshot with the names showing; the letters are found in a third
 * screenshot of the names alone, white on black).
 *
 * `under`: the contrast the product's own model gives the name's ink over its halo over the 99th percentile of
 * the luminance under it (state/namesLayout.ts nameContrast): at least 4.5. The brightest single pixel is a
 * star, whose brightness is random per page load: reported, not asserted. `ring`: the ink against the median of
 * the painted band: at least 4.5.
 *
 * The test browser renders in software (SwiftShader), which draws the gas dimmer than a GPU does, so a pass here
 * is weaker than a pass on a GPU. The renderer's name and the worst numbers are attached to the test. To run it
 * on a real GPU (E2E_GPU=1, playwright.config.ts): see the comment at the foot of this file.
 */
async function nameContrasts(page: Page): Promise<Array<{ name: string; halo: number; p99: number; max: number; ringMedian: number; ringPixels: number; letters: number; under: number; underMax: number; ring: number }>> {
  const names = await read(page);
  const shown = (await page.screenshot()).toString('base64');
  const style = await page.addStyleTag({ content: '.rn-layer { display: none !important; }' });
  const bare = (await page.screenshot()).toString('base64');
  await style.evaluate((el) => (el as Element).remove());
  // Where the letters are: the names alone, white on black, with no halo. (Telling them from the two pictures
  // above by their brightness loses most of a thin name that lies over gas nearly as bright as its ink.)
  const alone = await page.addStyleTag({
    content:
      '.map-pane { background: #000 !important; } canvas.map-canvas, .tw-layer { visibility: hidden !important; } .rn b { color: #fff !important; opacity: 1 !important; text-shadow: none !important; -webkit-text-stroke: 0 transparent !important; }',
  });
  const mask = (await page.screenshot()).toString('base64');
  await alone.evaluate((el) => (el as Element).remove());
  const px = await page.evaluate(
    async ([withNames, without, lettersOnly, list]) => {
      const load = async (data: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, d: ctx.getImageData(0, 0, img.width, img.height).data };
      };
      const a = await load(withNames);
      const b = await load(without);
      const m = await load(lettersOnly);
      const k = a.w / innerWidth;
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (d: Uint8ClampedArray, i: number) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      return list.map(({ box }) => {
        const under: number[] = [];
        const x0 = Math.max(0, Math.floor((box[0] - 8) * k));
        const y0 = Math.max(0, Math.floor((box[1] - 8) * k));
        const x1 = Math.min(b.w, Math.ceil((box[2] + 8) * k));
        const y1 = Math.min(b.h, Math.ceil((box[3] + 8) * k));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) under.push(lum(b.d, 4 * (y * b.w + x)));
        under.sort((p, q) => p - q);
        // The letters: the pixels in the box that are at least half as bright as the ink where the names are
        // painted alone in white (about three quarters covered by a letter). The ring: 2 to 3 px outside them
        // (the first pixel out is the letters' own soft edge).
        const ring: number[] = [];
        const ix0 = Math.max(0, Math.floor((box[0] - 4) * k));
        const iy0 = Math.max(0, Math.floor((box[1] - 4) * k));
        const ix1 = Math.min(a.w, Math.ceil((box[2] + 4) * k));
        const iy1 = Math.min(a.h, Math.ceil((box[3] + 4) * k));
        const w = ix1 - ix0;
        const h = iy1 - iy0;
        const ink = new Uint8Array(w * h);
        let letters = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (lum(m.d, 4 * ((y + iy0) * a.w + x + ix0)) >= 0.5) {
              ink[y * w + x] = 1;
              letters += 1;
            }
          }
        }
        const near = (x: number, y: number, r: number): boolean => {
          for (let v = Math.max(0, y - r); v <= Math.min(h - 1, y + r); v++) for (let u = Math.max(0, x - r); u <= Math.min(w - 1, x + r); u++) if (ink[v * w + u]) return true;
          return false;
        };
        const inner = Math.round(k);
        const outer = Math.round(3 * k);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (!near(x, y, outer) || near(x, y, inner)) continue;
            ring.push(lum(a.d, 4 * ((y + iy0) * a.w + x + ix0)));
          }
        }
        ring.sort((p, q) => p - q);
        return { p99: under[Math.min(under.length - 1, Math.floor(under.length * 0.99))], max: under[under.length - 1], ringMedian: ring.length ? ring[Math.floor(ring.length / 2)] : NaN, ringPixels: ring.length, letters };
      });
    },
    [shown, bare, mask, names.map((n) => ({ box: n.box }))] as const,
  );
  return names.map((n, i) => {
    const ink = luminance(n.ink);
    const alpha = n.fair ? 0.82 : 1;
    return {
      name: n.name,
      halo: n.halo,
      ...px[i],
      under: nameContrast(px[i].p99, ink, alpha, n.halo),
      underMax: nameContrast(px[i].max, ink, alpha, n.halo),
      ring: nameContrast(px[i].ringMedian, ink, alpha, 0),
    };
  });
}

async function expectContrast(page: Page, info: TestInfo, view: string, painted = false): Promise<void> {
  const rows = await nameContrasts(page);
  expect(rows.length, `${view}: names`).toBeGreaterThan(0);
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!.getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return String(gl ? gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : '');
  });
  const worst = (k: 'under' | 'underMax' | 'ring') => rows.reduce((m, r) => (r[k] < m[k] ? r : m));
  const text = `${view}, ${rows.length} names, renderer ${renderer}. Worst over the 99th percentile under the letters: ${worst('under').under.toFixed(2)} (${worst('under').name}). Worst over the brightest pixel (not asserted): ${worst('underMax').underMax.toFixed(2)} (${worst('underMax').name}). Worst against the painted halo: ${worst('ring').ring.toFixed(2)} (${worst('ring').name}). Halos ${[...new Set(rows.map((r) => r.halo))].sort().join(', ')}.`;
  info.annotations.push({ type: 'name contrast', description: text });
  console.log(`[names contrast] ${info.project.name} ${text}`);
  for (const r of rows) {
    expect(r.halo, `${view}: the halo of "${r.name}"`).toBeGreaterThanOrEqual(0.65);
    expect(r.under, `${view}: "${r.name}" over the 99th percentile of the gas under it (luminance ${r.p99.toFixed(3)}, halo ${r.halo})`).toBeGreaterThanOrEqual(4.5);
    if (!painted) continue;
    // The letters were found, and the band round them is a sample worth a median. The smallest name at the Whole
    // map (12 letters at 13 px, hairlines one device px wide) has fewer than 50 px as bright as half its ink, so
    // the letters are counted per character, and the band itself is counted too.
    expect(r.letters, `${view}: pixels of the letters of "${r.name}" found in the screenshot`).toBeGreaterThan(2 * r.name.replace(/\s/g, '').length);
    expect(r.ringPixels, `${view}: pixels in the band round "${r.name}"`).toBeGreaterThan(150);
    expect(r.ring, `${view}: "${r.name}" against the halo painted round it (median luminance ${r.ringMedian.toFixed(3)} 2 to 3 px outside its letters)`).toBeGreaterThanOrEqual(4.5);
  }
}

async function contrastAtBothViews(page: Page, info: TestInfo, isMobile: boolean, painted = false): Promise<void> {
  await openMap(page);
  await waitForGasSharpSettled(page);
  await stillSky(page);
  await expectContrast(page, info, 'Overview', painted);
  const since = await mapFrames(page);
  await act(fit(page), isMobile);
  await waitForCameraIdle(page, { since });
  await page.waitForTimeout(500);
  await waitForGasSharpSettled(page);
  await expectContrast(page, info, 'Whole map', painted);
}

for (const [w, h] of [[1440, 900], [1600, 1000]] as const) {
  test(`${w} x ${h}: every name holds 4.5:1 over the gas really under it, at the Overview and at the Whole map`, async ({ page, isMobile }, info) => {
    test.skip(isMobile, 'desktop windows');
    await page.setViewportSize({ width: w, height: h });
    await contrastAtBothViews(page, info, false);
  });
}

test('on a phone the four names hold 4.5:1 over the gas really under them, at the Overview and at the Whole map', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'phone only');
  await contrastAtBothViews(page, info, true);
  expect(await page.locator(SHOWN).count()).toBeLessThanOrEqual(4);
});

test('every name holds 4.5:1 against the halo as it is painted 2 to 3 px outside its letters, at the Overview and at the Whole map', async ({ page, isMobile }, info) => {
  // The tests above feed the product's model of the halo (a dark layer of strength --h right behind the letters)
  // with the pixels under a name. This one measures the halo that was painted: the name's ink against the median
  // of the pixels 2 to 3 px outside its letters, with the names showing (part 2 Task 7 review, item 17).
  await contrastAtBothViews(page, info, isMobile, true);
});

test('1600 x 1000: every name holds 4.5:1 against the halo as it is painted 2 to 3 px outside its letters, at the Overview and at the Whole map', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'a desktop window');
  // The same measure in the larger of the two desktop windows the review names (item 17): the names are larger
  // there and lie over other gas.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await contrastAtBothViews(page, info, false, true);
});

// Running the contrast tests on a real GPU (the numbers that count: the software renderer draws dimmer gas), by
// hand and on mains power, one project at a time:
//   E2E_GPU=1 npx playwright test e2e/names.spec.ts -g "4.5:1" --project=desktop --workers=1
// Each test prints and attaches the renderer's name with its worst numbers.
