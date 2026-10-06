/** Twinkle: every so often one star on screen catches the light. Ported from the Trifid prototype
 * (docs/design/trifid-theme/prototype/src/twinkle.js and its README, section Twinkle). This file is the pure
 * part: the settings, which star is picked, what its glint looks like, and the timer that decides when. The
 * DOM is written by overlays/Twinkle.tsx and canvas/TwinkleDriver.tsx. The map canvas is never redrawn for a
 * glint: nothing here asks for a frame. */
import { viewBounds, type OrthoCameraLike, type ViewBounds } from './projection';

/** Wait between two glints, ms: a fresh random value in this range each time. */
export const TWINKLE_WAIT_MS = [1200, 3000] as const;
/** Most glints alive at once. */
export const TWINKLE_MAX = 3;
/** One glint, in and out, ms. */
export const TWINKLE_DUR_MS = [1200, 1800] as const;
/** A glint whose `animationend` never came is removed this long after its animation should have ended. */
export const TWINKLE_REMOVE_SLACK_MS = 300;
/** How much likelier a star of each class is to glint (brighter stars more often). */
export const TWINKLE_WEIGHT = [12, 7, 2.5, 1] as const;
/** Bloom radius in CSS px: [0] times the star's drawn radius, plus [1]. */
export const TWINKLE_BLOOM = [5.5, 5] as const;
/** The two brightest classes also get a thin four point flare, this many star radii long each way. */
export const TWINKLE_FLARE = 12;
/** Peak opacity, and the quieter peak beside an open album, where the stars are dimmed. */
export const TWINKLE_PEAK = 1;
export const TWINKLE_PEAK_FOCUS = 0.6;
/** No glint is made for this long after the view last changed. */
export const TWINKLE_SETTLE_MS = 500;
/** Glints keep this far inside the visible map, and this far clear of a focus cover. */
export const TWINKLE_EDGE_PX = 6;
export const TWINKLE_COVER_CLEAR_PX = 6;

/** Screen position of a world point, canvas CSS px: x = ox + wx * kx, y = oy - wy * ky. */
export interface WorldToScreen {
  ox: number;
  oy: number;
  kx: number;
  ky: number;
}

/** The camera's projection as four numbers, so a pass over every album allocates nothing (the same result as
 * state/projection.ts worldToScreen with canvasRect). */
export function worldToScreenMap(c: OrthoCameraLike, width: number, height: number): WorldToScreen {
  const b = viewBounds(c);
  const kx = width / (b.right - b.left);
  const ky = height / (b.top - b.bottom);
  return { ox: -(c.position.x + b.left) * kx, oy: (b.top + c.position.y) * ky, kx, ky };
}

/** A focus cover no glint may sit under: its centre and half size (clearance included), canvas CSS px. */
export interface TwinkleCover {
  x: number;
  y: number;
  half: number;
}

export interface StarPick {
  /** Album index: a glint always sits on an album's star. */
  index: number;
  x: number;
  y: number;
}

/** One album whose star is inside `area` and not under a cover, brighter classes likelier: a weighted
 * reservoir, one pass and no list. `positions` is flat [x0, y0, x1, y1, ...] in world units. Null when no star
 * qualifies. */
export function pickStar(
  positions: Float32Array,
  classes: Uint8Array,
  to: WorldToScreen,
  area: ViewBounds,
  covers: readonly TwinkleCover[],
  random: () => number,
): StarPick | null {
  const n = Math.min(classes.length, positions.length >> 1);
  let index = -1;
  let total = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const x = to.ox + positions[2 * i] * to.kx;
    const y = to.oy - positions[2 * i + 1] * to.ky;
    if (x < area.left || x > area.right || y < area.top || y > area.bottom) continue;
    let under = false;
    for (const c of covers) {
      if (Math.abs(x - c.x) < c.half && Math.abs(y - c.y) < c.half) {
        under = true;
        break;
      }
    }
    if (under) continue;
    const w = TWINKLE_WEIGHT[classes[i]] ?? 1;
    total += w;
    if (random() * total < w) {
      index = i;
      px = x;
      py = y;
    }
  }
  return index < 0 ? null : { index, x: px, y: py };
}

export interface Glint {
  /** The album it sits on. */
  index: number;
  /** Centre, canvas CSS px: the star's own position. */
  x: number;
  y: number;
  /** Bloom radius, CSS px. */
  radius: number;
  /** Flare length from tip to tip, CSS px; null on the two fainter classes. */
  flare: number | null;
  /** The star's tint three quarters of the way to white, 0..255. */
  rgb: [number, number, number];
  peak: number;
  durMs: number;
}

/** The glint of a picked star. `starRadiusPx` is the star's radius as the shader draws it, `tint` its colour. */
export function glintFor(pick: StarPick, cls: number, starRadiusPx: number, tint: readonly number[], besideAlbum: boolean, random: () => number): Glint {
  return {
    index: pick.index,
    x: pick.x,
    y: pick.y,
    radius: TWINKLE_BLOOM[0] * starRadiusPx + TWINKLE_BLOOM[1],
    flare: cls < 2 ? 2 * TWINKLE_FLARE * starRadiusPx : null,
    rgb: [0, 1, 2].map((k) => Math.round((tint[k] + 765) / 4)) as [number, number, number],
    peak: besideAlbum ? TWINKLE_PEAK_FOCUS : TWINKLE_PEAK,
    durMs: Math.round(TWINKLE_DUR_MS[0] + random() * (TWINKLE_DUR_MS[1] - TWINKLE_DUR_MS[0])),
  };
}

/** The bloom: near white with alpha (a solid core, then a soft fall to nothing), so it shows on dark sky and on
 * bright gas without a blend mode. */
export function glintBackground(rgb: readonly number[]): string {
  const c = rgb.join(',');
  return `radial-gradient(circle closest-side, rgba(${c},1) 0, rgba(${c},1) 16%, rgba(${c},.62) 32%, rgba(${c},.24) 56%, rgba(${c},.07) 80%, rgba(${c},0) 100%)`;
}

/** A glint in the DOM: how long its animation runs, and how to take it out. */
export interface GlintHandle {
  durMs: number;
  remove: () => void;
}

export interface TwinkleHost {
  /** The tab is hidden. */
  hidden: () => boolean;
  reducedMotion: () => boolean;
  /** Stars are dots, the map is what the visitor is looking at, and nothing is moving. */
  resting: () => boolean;
  /** Puts one glint on a star, wired to call `ended` when its animation ends. Null when no star could be picked. */
  spawn: (ended: () => void) => GlintHandle | null;
}

export interface TwinkleEnv {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
  random: () => number;
}

export interface TwinkleStats {
  ticks: number;
  /** Ticks skipped because the view was not at rest. */
  notResting: number;
  /** Ticks skipped at the cap. */
  capped: number;
  spawned: number;
  /** Glints whose animation ran to its end. */
  played: number;
  /** Glints removed, played or not. */
  ended: number;
  /** Times the layer was cleared with glints in it. */
  cleared: number;
  alive: number;
  /** Longest star pick and DOM write, ms. */
  worstSpawnMs: number;
}

export interface Twinkle {
  /** Starts or stops the timer to match the tab, the motion setting and the switch. Call when one of them changes. */
  sync: () => void;
  /** The view changed (camera, slider, size, route): every glint goes, and none is made for TWINKLE_SETTLE_MS. */
  viewChanged: () => void;
  /** A switch for tests and measurements; on by default. */
  setEnabled: (on: boolean) => void;
  /** What the switch last said (measurements read it back to prove their run had what they asked for). */
  enabled: () => boolean;
  /** Stops for good: the timer is cleared and every glint removed. */
  dispose: () => void;
  stats: TwinkleStats;
}

/** One timer between glints and one per glint as a fallback removal. No frame loop, and no frame is requested. */
export function createTwinkle(host: TwinkleHost, env: TwinkleEnv): Twinkle {
  const stats: TwinkleStats = { ticks: 0, notResting: 0, capped: 0, spawned: 0, played: 0, ended: 0, cleared: 0, alive: 0, worstSpawnMs: 0 };
  const live = new Set<{ handle: GlintHandle | null }>();
  let timer: number | null = null;
  let lastMove = env.now();
  let enabled = true;
  let disposed = false;

  const running = (): boolean => enabled && !disposed && !host.hidden() && !host.reducedMotion();
  const clear = (): void => {
    if (live.size) stats.cleared++;
    for (const g of live) g.handle?.remove();
    live.clear();
    stats.alive = 0;
  };
  const finish = (g: { handle: GlintHandle | null }, played: boolean): void => {
    if (!live.delete(g)) return;
    g.handle?.remove();
    stats.alive = live.size;
    stats.ended++;
    if (played) stats.played++;
  };
  const schedule = (): void => {
    timer = env.setTimeout(tick, TWINKLE_WAIT_MS[0] + env.random() * (TWINKLE_WAIT_MS[1] - TWINKLE_WAIT_MS[0]));
  };
  function tick(): void {
    timer = null;
    if (!running()) return;
    stats.ticks++;
    if (!host.resting() || env.now() - lastMove <= TWINKLE_SETTLE_MS) stats.notResting++;
    else if (live.size >= TWINKLE_MAX) stats.capped++;
    else {
      const t0 = env.now();
      const g: { handle: GlintHandle | null } = { handle: null };
      const handle = host.spawn(() => finish(g, true));
      if (handle) {
        g.handle = handle;
        live.add(g);
        stats.spawned++;
        stats.alive = live.size;
        env.setTimeout(() => finish(g, false), handle.durMs + TWINKLE_REMOVE_SLACK_MS);
        stats.worstSpawnMs = Math.max(stats.worstSpawnMs, Math.round((env.now() - t0) * 100) / 100);
      }
    }
    schedule();
  }
  const sync = (): void => {
    if (!running()) {
      if (timer !== null) env.clearTimeout(timer);
      timer = null;
      clear();
      return;
    }
    if (timer === null) schedule();
  };
  return {
    sync,
    viewChanged: () => {
      lastMove = env.now();
      clear();
    },
    setEnabled: (on) => {
      enabled = on;
      sync();
    },
    enabled: () => enabled,
    dispose: () => {
      disposed = true;
      sync();
    },
    stats,
  };
}

/** Whether this device gets glints at all. Not on a software renderer, where the CPU draws and composites every
 * frame: there a glint playing while the map redraws for the mouse cost frames of 150 to 600 ms in about half the
 * page loads measured, with or without flares (docs/design/trifid-theme/reviews/app-twinkle-cost.md), so the
 * effect is dropped there, as the owner's rule asks. `softwareRenderer` is the gas layer's own answer
 * (window.__rmr.gasLite: true once it has chosen the lighter shader; absent until then and when there is no gas,
 * which counts as not software). A switch that says exactly 'on' plays them on any renderer: that is how the
 * browser tests, which draw in software, and the cost measurement see glints. */
export function twinkleShown(softwareRenderer: boolean | undefined, sw: 'off' | 'on' | undefined): boolean {
  return sw === 'on' || softwareRenderer !== true;
}

/** The glints' only switch: `window.__rmrTwinkle`, for tests, measurements and still pictures (there is no
 * control on screen, and nothing is saved). An exact 'off' means no glints; an exact 'on' means glints on any
 * renderer (twinkleShown); unset is the app's own behaviour. `onChange` is called once now with what the field
 * holds (so an init script that set it before the map loaded is honoured), and again inside every later
 * assignment: the field becomes an accessor, so a change mid-session takes effect in the same call, with no
 * polling and no timer. The returned function stops watching and leaves the last value behind as a plain field
 * for the next map. It lives here, in the map's own chunk, and not in the app store, which is part of the
 * first-load scripts. */
export function watchTwinkleSwitch(win: { __rmrTwinkle?: 'off' | 'on' }, onChange: (on: boolean) => void): () => void {
  let value = win.__rmrTwinkle;
  Object.defineProperty(win, '__rmrTwinkle', {
    configurable: true,
    enumerable: true,
    get: () => value,
    set: (v: 'off' | 'on' | undefined) => {
      value = v;
      onChange(v !== 'off');
    },
  });
  onChange(value !== 'off');
  return () => {
    Object.defineProperty(win, '__rmrTwinkle', { configurable: true, enumerable: true, writable: true, value });
  };
}
