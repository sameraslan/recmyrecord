import { createWidthCache, type WidthCache } from './namesLayout';

/** The page's one cache of region name widths, measured with a 2D canvas in the lettering face. A plain
 * module-level bridge, like state/overlayEls.ts: RegionNames sets the face and clears it, the driver reads it. */
let family = 'sans-serif';
let ctx: CanvasRenderingContext2D | null | undefined;

function measure100(text: string): number {
  if (ctx === undefined) {
    try {
      ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      ctx = null;
    }
  }
  // No canvas (tests, a locked-down browser): a rough width, so names still keep apart.
  if (!ctx) return text.length * 66;
  ctx.font = `400 100px ${family}`;
  return ctx.measureText(text).width;
}

export const nameWidths: WidthCache = createWidthCache(measure100);

let version = 0;

/** Forgets every width (the lettering face arrived, or changed) and bumps the version, so RegionNamesDriver,
 * which otherwise skips a frame whose inputs did not change, lays the names out again the next time it runs. */
export function clearNameWidths(): void {
  nameWidths.clear();
  version++;
}

export function nameWidthsVersion(): number {
  return version;
}

/** The computed font-family of the names layer (next/font gives the face a generated name). */
export function setNameFontFamily(next: string): void {
  if (!next || next === family) return;
  family = next;
  clearNameWidths();
}

let placer: (() => void) | null = null;

/** RegionNamesDriver registers its placement here while it is mounted. */
export function setNamesPlacer(fn: (() => void) | null): void {
  placer = fn;
}

/** Places the names again from the camera as it stands, without drawing a map frame: the names are DOM, so
 * when only they changed (switched on, their face arrived) the canvas has nothing new to draw. False when no
 * driver is mounted yet; the caller then asks for one frame, and the driver places on it. */
export function placeNamesNow(): boolean {
  if (!placer) return false;
  placer();
  return true;
}
