/** Region names: which show, how large, where, and how strong a halo each needs. Pure; RegionNamesDriver
 * feeds it screen positions each rendered frame and writes the result to the DOM. Ported from the Trifid
 * prototype's labels.js. Names are plain lettering: nothing here knows about hover, click or focus. They
 * never show while an album is open, so nothing here knows about focus covers or focus lines either. */
import type { ThemeLabel } from '@/lib/data/theme';
import type { StopId } from '@/lib/types';
import { STOP_T } from '../data';
import { NAMES_BAND_PX } from '../theme';
import type { ViewBounds } from './projection';

/** Most names at once on desktop (every approved Balanced name) and on a phone. */
export const NAMES_MAX = 17;
export const NAMES_MAX_PHONE = 4;
/** Tenor Sans runs wide: its sizes are 0.88 of the original lettering's. */
export const NAME_SIZE_K = 0.88;
/** Letter spacing in em (styles/map.css .rn b uses the same value). */
export const NAME_TRACK_EM = 0.26;
/** Covers are this size at the zoom the size tiers were drawn for. */
const NAME_REF_COVER_PX = 12.5;
/** A name stays this far inside the visible map. */
export const NAME_EDGE_PX = 10;
/** One name per this much free map, at most. */
const NAME_AREA_PX = 160 * 90;
export const NAME_CONTRAST = 4.5;
/** The map scale, in CSS px per world unit, at which part 1's build measured ThemeLabel.lum under each name's
 * box. Under this scale a name covers more of the map than was measured, so its halo is at full strength. */
export const NAME_LUM_PX_PER_WORLD = 600;
/** Opacity of a name that is not `strong` (styles/map.css .rn.fair). */
export const NAME_FAIR_ALPHA = 0.82;
/** Nudges tried in order when the true centre is taken; small, so a name stays on its region. */
export const NAME_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0], [0, -22], [0, 22], [-40, 0], [40, 0], [0, -46], [0, 46], [-70, -30], [70, 30], [70, -30], [-70, 30], [0, -78], [0, 78],
];

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** Overlay key of a name's element (ids repeat across stops, so the stop is part of it). */
export const nameKey = (stop: StopId, id: string): string => `name:${stop}:${id}`;

/** Names show at Whole map and Overview and are gone once the map is zoomed in (so long before covers show,
 * which starts at 16 px), and they never show while an album is open. No partial fade. */
export function namesShown(coverPx: number, albumOpen: boolean): boolean {
  return !albumOpen && coverPx < NAMES_BAND_PX;
}

export function nameZoomK(coverPx: number): number {
  return clamp(Math.pow(coverPx / NAME_REF_COVER_PX, 0.3), 0.85, 1.35);
}

/** Font size in CSS px, in half-pixel steps so the element's font-size is rewritten only on a visible change. */
export function nameFontPx(label: Pick<ThemeLabel, 'strong' | 'n'>, phone: boolean, zoomK: number): number {
  const s = Math.min(1, Math.sqrt(label.n / 346));
  const base = NAME_SIZE_K * (label.strong ? 17 + 7 * s : 15 + 3 * s);
  const px = phone ? clamp(base * 0.72, 13, 16) : base * zoomK;
  return Math.round(px * 2) / 2;
}

export interface NameFade {
  stop: StopId;
  alpha: number;
}

/** Which stops' names show at slider position `sliderT` on the way from stop `from` to stop `to`: the outgoing
 * names fade out over the first 40% of the way, the incoming fade in over the last 40%. Names do not travel:
 * ids differ between stops. */
export function nameFades(sliderT: number, from: StopId, to: StopId): NameFade[] {
  const a = STOP_T[from];
  const b = STOP_T[to];
  if (a === b) return [{ stop: to, alpha: 1 }];
  const k = clamp((sliderT - a) / (b - a), 0, 1);
  const out: NameFade[] = [];
  const fadeOut = clamp(1 - k / 0.4, 0, 1);
  const fadeIn = clamp((k - 0.6) / 0.4, 0, 1);
  if (fadeOut > 0) out.push({ stop: from, alpha: fadeOut });
  if (fadeIn > 0) out.push({ stop: to, alpha: fadeIn });
  return out;
}

const linear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of an sRGB colour, 0..255 per channel. */
export function luminance(rgb: readonly number[]): number {
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** Contrast of ink (luminance `inkLum`, opacity `inkAlpha`) against its dark halo of strength `halo` over gas
 * of luminance `bgLum`. The halo is the name's immediate surround, so it is what the ink is measured against. */
export function nameContrast(bgLum: number, inkLum: number, inkAlpha: number, halo: number): number {
  const b = bgLum * Math.pow(Math.max(0, 1 - halo), 2.2);
  const t = Math.pow(inkAlpha * Math.pow(inkLum, 1 / 2.2) + (1 - inkAlpha) * Math.pow(b, 1 / 2.2), 2.2);
  return (t + 0.05) / (b + 0.05);
}

/** Halo strength (the CSS --h, 0.65..1) that brings a name to `ratio`:1 over gas of luminance `bgLum`: the
 * first strength from 0.5 in steps of 0.05 that reaches it, plus 0.15. Full when none does. */
export function haloFor(bgLum: number, inkLum: number, inkAlpha = 1, ratio = NAME_CONTRAST): number {
  for (let step = 10; step <= 20; step++) {
    const h = step / 20;
    if (nameContrast(bgLum, inkLum, inkAlpha, h) >= ratio) return Math.min(1, h + 0.15);
  }
  return 1;
}

export interface NameCandidate {
  key: string;
  label: ThemeLabel;
  /** Screen position of the label's point, canvas CSS px. */
  x: number;
  y: number;
  /** 1, or less while its stop fades in or out during a slider morph. */
  alpha: number;
}

export interface PlacedName {
  key: string;
  /** Centre of the name, canvas CSS px. */
  x: number;
  y: number;
  fontPx: number;
  alpha: number;
  halo: number;
}

export interface NamesInput {
  candidates: readonly NameCandidate[];
  /** The part of the canvas that shows the map. */
  visible: ViewBounds;
  /** Rectangles no name may touch: chrome, the picked album. */
  blockers: readonly ViewBounds[];
  phone: boolean;
  zoomK: number;
  /** The map scale, CSS px per world unit: under NAME_LUM_PX_PER_WORLD every name gets the full halo. */
  pxPerWorld: number;
  /** Every name gets the full halo whatever the scale (during a slider morph and on a phone, when label.lum
   * does not describe the gas behind the name). */
  fullHalo: boolean;
  /** Width of a name's text at a font size, CSS px. */
  widthOf: (label: ThemeLabel, fontPx: number) => number;
  /** The offset each name last used; read and written, so a name does not jump while the map moves. */
  sticky: Map<string, number>;
}

/** Does the box (l, t, r, b) touch any of `list`? */
function hitsAny(l: number, t: number, r: number, b: number, list: readonly ViewBounds[]): boolean {
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (l < k.right && r > k.left && t < k.bottom && b > k.top) return true;
  }
  return false;
}

/** Boxes of the names placed so far in this call, four numbers each (left, top, right, bottom). */
const taken = new Float64Array(4 * NAMES_MAX);

/** Does the box (l, t, r, b) touch any of the first `count` taken boxes? */
function hitsTaken(l: number, t: number, r: number, b: number, count: number): boolean {
  for (let i = 0; i < count * 4; i += 4) {
    if (l < taken[i + 2] && r > taken[i] && t < taken[i + 3] && b > taken[i + 1]) return true;
  }
  return false;
}

/** Highest priority first; the key breaks ties so the order never depends on the input's. */
const byPriority = (p: NameCandidate, q: NameCandidate): number => q.label.p - p.label.p || (p.key < q.key ? -1 : 1);

/** The solved halo of an unmoved name depends only on its label (immutable theme data): solved once per label. */
const solvedHalo = new WeakMap<ThemeLabel, number>();
function haloOf(label: ThemeLabel): number {
  let h = solvedHalo.get(label);
  if (h === undefined) {
    h = haloFor(label.lum, luminance(label.rgb), label.strong ? 1 : NAME_FAIR_ALPHA);
    solvedHalo.set(label, h);
  }
  return h;
}

/** Scratch reused by every call (the layout runs on camera frames, so it allocates little beyond its result). */
const order: NameCandidate[] = [];

/** Places names in priority order. Returns only the names that found a spot; the caller hides the rest. */
export function layoutNames(input: NamesInput): PlacedName[] {
  const { visible: v, blockers, phone, zoomK, sticky } = input;
  // label.lum holds for the unmoved name at rest, at NAME_LUM_PX_PER_WORLD or closer in.
  const fullHalo = input.fullHalo || input.pxPerWorld < NAME_LUM_PX_PER_WORLD;
  let blocked = 0;
  for (const k of blockers) {
    blocked += Math.max(0, Math.min(k.right, v.right) - Math.max(k.left, v.left)) * Math.max(0, Math.min(k.bottom, v.bottom) - Math.max(k.top, v.top));
  }
  const area = Math.max(0, v.right - v.left) * Math.max(0, v.bottom - v.top);
  const budget = Math.min(phone ? NAMES_MAX_PHONE : NAMES_MAX, Math.max(1, Math.floor((area - blocked) / NAME_AREA_PX)));
  const minX = v.left + NAME_EDGE_PX;
  const maxX = v.right - NAME_EDGE_PX;
  const minY = v.top + NAME_EDGE_PX;
  const maxY = v.bottom - NAME_EDGE_PX;
  order.length = 0;
  for (const c of input.candidates) if (c.alpha > 0) order.push(c);
  order.sort(byPriority);
  const placed: PlacedName[] = [];
  let used = 0;
  try {
    for (let i = 0; i < order.length && placed.length < budget; i++) {
      const c = order[i];
      if (c.x < v.left || c.x > v.right || c.y < v.top || c.y > v.bottom) continue;
      const fontPx = nameFontPx(c.label, phone, zoomK);
      const w = input.widthOf(c.label, fontPx) / 2 + 6;
      const h = (fontPx * 1.05) / 2 + 4;
      const keep = sticky.get(c.key) ?? 0;
      let found = false;
      let l = 0;
      let t = 0;
      let r = 0;
      let b = 0;
      // The spot it had last time first, then the others in order.
      for (let n = 0; n <= NAME_OFFSETS.length; n++) {
        const k = n === 0 ? keep : n - 1;
        if ((n > 0 && k === keep) || !NAME_OFFSETS[k]) continue;
        const x = c.x + NAME_OFFSETS[k][0];
        const y = c.y + NAME_OFFSETS[k][1];
        l = x - w;
        t = y - h;
        r = x + w;
        b = y + h;
        if (l < minX || r > maxX || t < minY || b > maxY) continue;
        if (hitsAny(l, t, r, b, blockers) || hitsTaken(l, t, r, b, placed.length)) continue;
        found = true;
        used = k;
        break;
      }
      if (!found) continue;
      sticky.set(c.key, used);
      const j = placed.length * 4;
      taken[j] = l;
      taken[j + 1] = t;
      taken[j + 2] = r;
      taken[j + 3] = b;
      placed.push({
        key: c.key,
        x: Math.round((l + r) * 5) / 10,
        y: Math.round((t + b) * 5) / 10,
        fontPx,
        alpha: c.alpha,
        // label.lum is the brightest gas under the unmoved name: a nudged name takes the full halo too.
        halo: fullHalo || used !== 0 ? 1 : haloOf(c.label),
      });
    }
  } finally {
    // Drop the references so the scratch holds no candidate between calls.
    order.length = 0;
  }
  return placed;
}

export interface ChromeInput {
  /** Canvas size, CSS px. */
  width: number;
  height: number;
  /** CSS px at the top of the canvas covered by the site header (state/stageTop.ts): 0 while the stage starts
   * below the header. Everything anchored to the top of the map sits this much lower. */
  top: number;
  /** CSS px covered on the left by the album panel while it slides away (names only show once no album is open). */
  inset: number;
  phone: boolean;
  /** CSS px covered by the phone slider panel along the bottom (MapInput.bottomCover). */
  bottomCover: number;
  /** Explore with a picked album: its card is shown (and the hint is not). */
  card: boolean;
}

/** Height of the zoom corner: the names toggle, an 8 px gap, three zoom buttons (40 px each; 44 on a phone).
 * The button side is `--zb` in styles/map.css and styles/phone.css. It is repeated here, not read: this runs per
 * frame and reads no layout. Change the three together. */
const ZOOM_CORNER_DESKTOP_PX = 40 + 8 + 3 * 40;
const ZOOM_CORNER_PHONE_PX = 44 + 8 + 3 * 44;

/** The map's controls as rectangles in canvas CSS px, from the fixed positions in styles/map.css and
 * styles/phone.css with a few px to spare (nothing is measured, so no layout is read per frame). Only the
 * controls of Explore: names never show while an album is open. The header itself is kept clear by the
 * caller, which starts the visible area at `top`. */
export function chromeBlockers(c: ChromeInput): ViewBounds[] {
  const { width: W, height: H, inset: L, top: T } = c;
  const out: ViewBounds[] = [];
  if (c.phone) {
    // The slider panel across the bottom, and the zoom corner 8 px above it on the right.
    out.push({ left: 0, top: H - c.bottomCover - 10, right: W, bottom: H });
    out.push({ left: W - 64, top: H - c.bottomCover - 16 - ZOOM_CORNER_PHONE_PX, right: W, bottom: H - c.bottomCover });
    if (c.card) out.push({ left: 0, top: H - c.bottomCover - 160, right: W, bottom: H });
    return out;
  }
  out.push({ left: L + 12, top: T + 12, right: L + 272, bottom: T + 154 }); // the slider card, top left
  out.push({ left: W - 68, top: H - 28 - ZOOM_CORNER_DESKTOP_PX, right: W, bottom: H }); // toggle plus zoom stack
  if (c.card) out.push({ left: L + 12, top: H - 200, right: L + 428, bottom: H });
  else out.push({ left: L, top: H - 46, right: L + Math.min(380, W - L - 80), bottom: H }); // the hint line
  return out;
}

export interface WidthCache {
  widthOf: (label: ThemeLabel, fontPx: number) => number;
  /** Forget every width (the lettering face arrived, or changed). */
  clear: () => void;
}

/** Text widths, measured once per name at 100 px by `measure100` (the capitals, without tracking) and scaled.
 * Widths taken before the face loaded are wrong: call clear() when it arrives. */
export function createWidthCache(measure100: (text: string) => number): WidthCache {
  const at100 = new Map<string, number>();
  return {
    widthOf(label, fontPx) {
      let w = at100.get(label.name);
      if (w === undefined) {
        w = measure100(label.name.toUpperCase()) + 100 * NAME_TRACK_EM * label.name.length;
        at100.set(label.name, w);
      }
      return (w * fontPx) / 100;
    },
    clear() {
      at100.clear();
    },
  };
}
