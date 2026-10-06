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
/** A glint's star keeps this far clear of a focus cover. */
export const TWINKLE_COVER_CLEAR_PX = 6;
/** A glint's whole extent (bloom and flare) keeps this far clear of every glass surface and of the edges of the
 * visible map: the blur radius of the glass (--glass-blur in app/globals.css). A layer that animates under a
 * blurred surface makes the browser work that blur out again on every frame the glint plays. */
export const TWINKLE_GLASS_CLEAR_PX = 22;
/** No glint is made while an album is hovered, nor for this long after the hover ended: the hover label's first
 * paints and a new glint are kept out of the same frames. Ruled for speed before it was measured, and to be
 * measured again; to take it out, remove this constant, the one condition in the timer's tick that uses it, and
 * hoverChanged with its one call (canvas/TwinkleDriver.tsx). */
export const TWINKLE_HOVER_HOLD_MS = 500;

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

/** How far a glint reaches from its star, CSS px each way: its bloom, or its flare where that is longer. The
 * keyframe never scales it past 1 (styles/map.css tw-glint). `starRadiusPx` as in glintFor. */
export function glintReach(cls: number, starRadiusPx: number): number {
  const bloom = TWINKLE_BLOOM[0] * starRadiusPx + TWINKLE_BLOOM[1];
  return cls < 2 ? Math.max(bloom, TWINKLE_FLARE * starRadiusPx) : bloom;
}

/** The part of the canvas a glint's whole extent must stay inside, canvas CSS px: below the header (`top`,
 * state/stageTop.ts), right of the album panel (`inset`, the animated one), above the phone's slider panel
 * (`bottomCover`), each with the glass clearance, and as far inside the canvas's own edges. */
export function glintArea(v: { width: number; height: number; top: number; inset: number; bottomCover: number }): ViewBounds {
  return {
    left: Math.max(0, v.inset) + TWINKLE_GLASS_CLEAR_PX,
    top: v.top + TWINKLE_GLASS_CLEAR_PX,
    right: v.width - TWINKLE_GLASS_CLEAR_PX,
    bottom: v.height - v.bottomCover - TWINKLE_GLASS_CLEAR_PX,
  };
}

/** The glass surfaces (overlays/Twinkle.tsx glassRects), each grown by the clearance: what pickStar keeps every
 * glint's box out of. */
export function glintBlockers(glass: readonly ViewBounds[]): ViewBounds[] {
  const c = TWINKLE_GLASS_CLEAR_PX;
  return glass.map((r) => ({ left: r.left - c, top: r.top - c, right: r.right + c, bottom: r.bottom + c }));
}

const NO_REACH: readonly number[] = [0, 0, 0, 0];
const NO_BLOCKERS: readonly ViewBounds[] = [];

/** One album whose star is not under a cover and whose whole glint lies inside `area` and clear of every
 * rectangle in `blockers` (the glass surfaces), brighter classes likelier: a weighted reservoir, one pass and no
 * list. `positions` is flat [x0, y0, x1, y1, ...] in world units; `reach` is how far a glint of each star class
 * reaches from its star (glintReach), so the test is on the glint's box, not on the star's centre. Null when no
 * star qualifies. */
export function pickStar(
  positions: Float32Array,
  classes: Uint8Array,
  to: WorldToScreen,
  area: ViewBounds,
  covers: readonly TwinkleCover[],
  random: () => number,
  reach: readonly number[] = NO_REACH,
  blockers: readonly ViewBounds[] = NO_BLOCKERS,
): StarPick | null {
  const n = Math.min(classes.length, positions.length >> 1);
  let index = -1;
  let total = 0;
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    const x = to.ox + positions[2 * i] * to.kx;
    const y = to.oy - positions[2 * i + 1] * to.ky;
    const r = reach[classes[i]] ?? 0;
    if (x - r < area.left || x + r > area.right || y - r < area.top || y + r > area.bottom) continue;
    let under = false;
    for (const b of blockers) {
      if (x + r > b.left && x - r < b.right && y + r > b.top && y - r < b.bottom) {
        under = true;
        break;
      }
    }
    if (under) continue;
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
  /** A glint can be made here at all: the renderer is not known to be a software one, the map is what the
   * visitor is looking at, and stars are dots (no covers). While this is false there is no timer. Whoever knows
   * that it may have changed calls sync or viewChanged; nothing polls it. */
  possible: () => boolean;
  /** Nothing is moving right now, and the renderer is known to be a GPU. Asked on a tick only. */
  resting: () => boolean;
  /** An album is hovered right now. Asked on a tick only. */
  hovered: () => boolean;
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
  /** Ticks skipped because an album was hovered, or had been within TWINKLE_HOVER_HOLD_MS. */
  hoverHeld: number;
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
  /** Starts or stops the timer to match the tab, the motion setting, the switch and whether a glint is possible
   * here (TwinkleHost.possible). Call when one of them may have changed. */
  sync: () => void;
  /** The view changed (camera, slider, size, route): every glint goes, none is made for TWINKLE_SETTLE_MS, and
   * the timer is started or stopped to match what is possible now. */
  viewChanged: () => void;
  /** An album came under the mouse or left it: no glint is made for TWINKLE_HOVER_HOLD_MS from now. The glints
   * that are playing are left to finish. */
  hoverChanged: () => void;
  /** A switch for tests and measurements; on by default. */
  setEnabled: (on: boolean) => void;
  /** What the switch last said (measurements read it back to prove their run had what they asked for). */
  enabled: () => boolean;
  /** Stops for good: the timer is cleared and every glint removed. */
  dispose: () => void;
  stats: TwinkleStats;
}

/** One timer between glints and one per glint as a fallback removal. No frame loop, and no frame is requested.
 * While no glint can be made (hidden tab, reduced motion, switch off, TwinkleHost.possible false) there is no
 * timer of either kind: nothing wakes the page. */
export function createTwinkle(host: TwinkleHost, env: TwinkleEnv): Twinkle {
  interface Live {
    handle: GlintHandle;
    /** The fallback removal's timer. */
    fallback: number;
  }
  const stats: TwinkleStats = { ticks: 0, notResting: 0, hoverHeld: 0, capped: 0, spawned: 0, played: 0, ended: 0, cleared: 0, alive: 0, worstSpawnMs: 0 };
  const live = new Set<Live>();
  let timer: number | null = null;
  let lastMove = env.now();
  let lastHover = -Infinity;
  let enabled = true;
  let disposed = false;

  const running = (): boolean => enabled && !disposed && !host.hidden() && !host.reducedMotion() && host.possible();
  const clear = (): void => {
    if (live.size) stats.cleared++;
    for (const g of live) {
      env.clearTimeout(g.fallback);
      g.handle.remove();
    }
    live.clear();
    stats.alive = 0;
  };
  const finish = (g: Live, played: boolean): void => {
    if (!live.delete(g)) return;
    env.clearTimeout(g.fallback);
    g.handle.remove();
    stats.alive = live.size;
    stats.ended++;
    if (played) stats.played++;
  };
  const schedule = (): void => {
    timer = env.setTimeout(tick, TWINKLE_WAIT_MS[0] + env.random() * (TWINKLE_WAIT_MS[1] - TWINKLE_WAIT_MS[0]));
  };
  /** An album is hovered, or was within the hold. The hover is read here, on the tick; hoverChanged gives the
   * moment of a change between two ticks. */
  const hoverHeld = (now: number): boolean => {
    if (host.hovered()) lastHover = now;
    return now - lastHover < TWINKLE_HOVER_HOLD_MS;
  };
  function tick(): void {
    timer = null;
    if (!running()) return sync();
    stats.ticks++;
    const now = env.now();
    if (!host.resting() || now - lastMove <= TWINKLE_SETTLE_MS) stats.notResting++;
    else if (hoverHeld(now)) stats.hoverHeld++;
    else if (live.size >= TWINKLE_MAX) stats.capped++;
    else {
      let g: Live | null = null;
      const handle = host.spawn(() => {
        if (g) finish(g, true);
      });
      if (handle) {
        const made: Live = { handle, fallback: env.setTimeout(() => finish(made, false), handle.durMs + TWINKLE_REMOVE_SLACK_MS) };
        g = made;
        live.add(made);
        stats.spawned++;
        stats.alive = live.size;
        stats.worstSpawnMs = Math.max(stats.worstSpawnMs, Math.round((env.now() - now) * 100) / 100);
      }
    }
    // resting() may have learned that no glint can be made here (the renderer's name): then this was the last tick.
    if (running()) schedule();
    else sync();
  }
  function sync(): void {
    if (!running()) {
      if (timer !== null) env.clearTimeout(timer);
      timer = null;
      clear();
      return;
    }
    if (timer === null) schedule();
  }
  return {
    sync,
    viewChanged: () => {
      lastMove = env.now();
      clear();
      sync();
    },
    hoverChanged: () => {
      lastHover = env.now();
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

/** Whether a glint may be made on this device now. Not on a software renderer, where glints forced on cost
 * frames of 150 to 700 ms in about half the page loads measured (docs/design/trifid-theme/reviews/
 * app-twinkle-cost.md; the cause is not known), so the effect is dropped there, as the owner's rule asks; and
 * not while the renderer is unknown, which is not the same as a GPU. `software` is the renderer's own verdict
 * (state/renderer.ts softwareRenderer), whatever gas shader was chosen. A switch that says exactly 'on' plays
 * them on any renderer: a forced state no visitor has, for the browser tests, which draw in software, and for
 * the cost measurement. */
export function twinkleShown(software: boolean | undefined, sw: 'off' | 'on' | undefined): boolean {
  return sw === 'on' || software === false;
}

/** True when this device will never get a glint: a renderer known to be software, and no switch forcing them.
 * Then there is no timer at all. An unknown renderer is not ruled out: the timer runs, and a quiet tick asks. */
export function twinkleRuledOut(software: boolean | undefined, sw: 'off' | 'on' | undefined): boolean {
  return sw !== 'on' && software === true;
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
