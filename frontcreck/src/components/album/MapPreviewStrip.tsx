'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { TILE } from '@/components/Cover';
import { MARKER_GAP, layoutMarkers } from '@/components/map/state/focusLayout';
import { FRAME_RGB, SKY_RGB, STAR_WHITE } from '@/components/map/theme';
import { COPY } from '@/lib/copy';
import { coverUrl } from '@/lib/data/catalog';
import { loadTheme, themeFor } from '@/lib/data/theme';
import type { ThemeGas } from '@/lib/data/theme';
import { useCatalog, usePositions } from '@/lib/data/useData';
import { useIsNarrow } from '@/lib/media';
import type { AlbumRecord, Focus, StopId } from '@/lib/types';

const rgba = ([r, g, b]: readonly number[], a: number) => `rgba(${r},${g},${b},${a})`;
/** The map's empty sky, its stars and its off-white frames (components/map/theme.ts), plus two tokens of globals.css. */
const SKY = rgba(SKY_RGB, 1);
const STAR = rgba(STAR_WHITE, 0.7);
const FRAME = rgba(FRAME_RGB, 1);
const FRAME_QUIET = rgba(FRAME_RGB, 0.6);
const BADGE_EDGE = rgba(FRAME_RGB, 0.45);
const ROOM = '#07060a'; // --color-room
const PAPER = '#f3eee7'; // --color-paper
/** The lines to the closest albums, as on the map: white on a dark casing, so they hold on any gas. */
const LINE_CASING = 'rgba(4,4,8,.8)';
const LINE = 'rgba(255,255,255,.92)';
/** Strip covers are smaller than the map's markers (64 / 46): the mockup's compact MapView sizes. */
const STRIP_SEED = 38;
const STRIP_REC = 28;
/** Every album is one dot of this radius (CSS px): the strip has no star sizes, so none can follow order or rank. */
const STAR_PX = 1.3;

/** The gas of one slider stop, drawn under the strip's stars. */
export interface StripGas {
  image: CanvasImageSource;
  /** The raw rectangle the image covers: west, south, east, north (theme.json gas[stop].rect), north up. */
  rect: readonly [number, number, number, number];
}
/** The strip shows a small part of the 2048 px gas image, so it keeps a copy this long and lets the full decode go. */
const GAS_PX = 512;
/** How strongly the gas is drawn (the prototype's strip): stepped back, as the map steps it back beside an open
 * album, so the covers and the stars stay the subject on the brightest gas too. */
export const STRIP_GAS_STRENGTH = 0.62;
/** The first gas image of a stop: the same name as shaders/gas.ts gasUrl(stop, hash), so the strip and the map share
 * one download. Written out here because gas.ts holds the gas shaders and belongs to the lazy map chunk
 * (MapPreviewStrip.test.ts keeps the two equal). Phones never use the sharper image. */
export const stripGasUrl = (stop: StopId, hash: readonly [string, string]): string => `/data/theme/gas-${stop}.${hash[0]}.webp`;
/** Size of the strip's copy: the image's own aspect, longer side GAS_PX. */
export function gasCopySize(px: readonly [number, number]): [number, number] {
  const k = GAS_PX / Math.max(px[0], px[1]);
  return [Math.max(1, Math.round(px[0] * k)), Math.max(1, Math.round(px[1] * k))];
}

const gasCopies = new Map<string, Promise<HTMLCanvasElement>>();

/** The small copy of a stop's gas image, made once per image (the hash is in the URL) and kept for the page's life. */
function loadGas(stop: StopId, gas: ThemeGas): Promise<HTMLCanvasElement> {
  const url = stripGasUrl(stop, gas.hash);
  let copy = gasCopies.get(url);
  if (!copy) {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    copy = im.decode().then(() => {
      // An image of another size is an image of another bake: in this bake's rectangle it would put the gas beside
      // the albums (the rule of gasImageFits in shaders/gas.ts).
      if (im.naturalWidth !== gas.px[0] || im.naturalHeight !== gas.px[1]) throw new Error('gas image of another bake');
      const [cw, ch] = gasCopySize(gas.px);
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('no 2D canvas');
      ctx.drawImage(im, 0, 0, cw, ch);
      return c;
    });
    // A failed load is forgotten, so the next strip tries again; this one draws without gas.
    copy.catch(() => gasCopies.delete(url));
    gasCopies.set(url, copy);
  }
  return copy;
}

const images = new Map<string, { im: HTMLImageElement; decoded: boolean; failed: boolean; waiting: Set<() => void> }>();

/** A cover is drawn only after img.decode() resolved (off the main thread); until then the tile is drawn. */
function readyImage(url: string, onReady: () => void): HTMLImageElement | null {
  let entry = images.get(url);
  if (!entry) {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    const e = { im, decoded: false, failed: false, waiting: new Set<() => void>() };
    entry = e;
    images.set(url, e);
    im.decode().then(
      () => {
        e.decoded = true;
        e.waiting.forEach((f) => f());
        e.waiting.clear();
      },
      // A cover that cannot be decoded keeps its tile: drawing a lettered tile is the designed fallback, so the
      // failure is recorded (no retry, no redraw) rather than reported.
      () => {
        e.failed = true;
        e.waiting.clear();
      },
    );
  }
  if (entry.decoded) return entry.im;
  if (!entry.failed) entry.waiting.add(onReady);
  return null;
}

/** The compact map of the phone album list: the sky, the stop's gas when it has loaded, a star per album, cased
 * lines to the closest albums, small covers (seed 38 px, recs 28 px, kept inside the canvas) and rank badges
 * drawn last, so no cover hides one. Without `gas` everything else is still drawn. */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  albums: readonly AlbumRecord[],
  pos: readonly number[],
  focus: Focus,
  gas: StripGas | null,
  onReady: () => void,
): void {
  ctx.fillStyle = SKY;
  ctx.fillRect(0, 0, w, h);
  const ids = [focus.seed, ...focus.recs];
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const i of ids) {
    x0 = Math.min(x0, pos[2 * i]);
    x1 = Math.max(x1, pos[2 * i]);
    y0 = Math.min(y0, pos[2 * i + 1]);
    y1 = Math.max(y1, pos[2 * i + 1]);
  }
  const pad = 30;
  const k = Math.min(Math.max(Math.min((w - 2 * pad) / Math.max(x1 - x0, 0.3), (h - 2 * pad) / Math.max(y1 - y0, 0.3)), Math.min(w, h) / 8), 5000);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const sx = (x: number) => w / 2 + (x - cx) * k;
  const sy = (y: number) => h / 2 - (y - cy) * k;
  if (gas) {
    // The strip draws in raw positions, the units of the image's rectangle, so the image maps with the same
    // scale. It holds the gas's light only (black where there is none, darker under dust), so it is added to the
    // sky, as the map's shader adds it; beyond the rectangle the sky fill stays.
    const [west, south, east, north] = gas.rect;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = STRIP_GAS_STRENGTH;
    ctx.drawImage(gas.image, sx(west), sy(north), (east - west) * k, (north - south) * k);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath();
  for (let i = 0; i < albums.length; i++) {
    const x = sx(pos[2 * i]);
    const y = sy(pos[2 * i + 1]);
    if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
    ctx.moveTo(x + STAR_PX, y);
    ctx.arc(x, y, STAR_PX, 0, Math.PI * 2);
  }
  ctx.fillStyle = STAR;
  ctx.fill();
  const placed = layoutMarkers(ids.map((id) => ({ id, x: sx(pos[2 * id]), y: sy(pos[2 * id + 1]) })), STRIP_SEED, STRIP_REC, {
    // 6 px: room for the badges (4 px out, top-left) and the seed's frame (5 px out).
    bounds: { left: 6, top: 6, right: w - 6, bottom: h - 6 },
    gap: MARKER_GAP,
    // The strip's covers are small: 10 px of visible line is enough (layoutMarkers defaults to more).
    minLine: 10,
  });
  for (const [stroke, width] of [[LINE_CASING, 3], [LINE, 1.2]] as const) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    for (const it of placed.slice(1)) {
      ctx.beginPath();
      ctx.moveTo(placed[0].x, placed[0].y);
      ctx.lineTo(it.x, it.y);
      ctx.stroke();
    }
  }
  for (const it of [...placed.slice(1), placed[0]]) {
    const a = albums[it.id];
    const s = it.size;
    const x = it.x - s / 2;
    const y = it.y - s / 2;
    if (it.seed) {
      // The seed's frame sits on a dark backing, so it reads on the brightest gas too.
      ctx.fillStyle = ROOM;
      ctx.fillRect(x - 5, y - 5, s + 10, s + 10);
    }
    const url = coverUrl(a.c, s);
    const im = url ? readyImage(url, onReady) : null;
    if (im) ctx.drawImage(im, x, y, s, s);
    else {
      ctx.fillStyle = TILE[a.k % 3];
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = it.seed ? FRAME : FRAME_QUIET;
    ctx.lineWidth = it.seed ? 2 : 1;
    const o = it.seed ? 4 : 0.5;
    ctx.strokeRect(x - o, y - o, s + 2 * o, s + 2 * o);
  }
  const b = 14;
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (const it of placed.slice(1)) {
    const bx = it.x - it.size / 2 - 4;
    const by = it.y - it.size / 2 - 4;
    ctx.fillStyle = ROOM;
    ctx.fillRect(bx, by, b, b);
    ctx.strokeStyle = BADGE_EDGE;
    ctx.strokeRect(bx + 0.5, by + 0.5, b - 1, b - 1);
    ctx.fillStyle = PAPER;
    ctx.fillText(String(it.rank), bx + b / 2, by + b / 2 + 0.5);
  }
}

export function MapPreviewStrip({ focus, stop, onOpen }: { focus: Focus; stop: StopId; onOpen: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  // The strip only exists under 900 px; on wider screens it is display:none, so load nothing for it there.
  const narrow = useIsNarrow();
  const { catalog } = useCatalog(narrow);
  const { positions } = usePositions(narrow);
  const recsKey = focus.recs.join(',');
  // The strip sits under the list, off screen when an album opens. Its gas image is asked for only once the strip
  // is near the screen, so opening an album costs no image decode for a picture nobody has scrolled to.
  const [near, setNear] = useState(false);
  // The gas of one stop; the strip draws without it until it arrives, and for good if it cannot load.
  const [gas, setGas] = useState<(StripGas & { stop: StopId }) | null>(null);
  const count = catalog?.albums.length ?? 0;

  useEffect(() => {
    const el = box.current;
    if (!el || !narrow || near) return;
    const seen = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '300px' },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [narrow, near]);

  useEffect(() => {
    if (!narrow || !near || !count) return;
    let live = true;
    loadTheme()
      .then((loaded) => {
        // A theme baked for another album count draws no gas (as the map: themeFor).
        const theme = themeFor(loaded, count);
        if (!theme) return null;
        const g = theme.gas[stop];
        return loadGas(stop, g).then((image) => ({ stop, image, rect: g.rect }));
      })
      .then(
        (next) => {
          if (live && next) setGas(next);
        },
        // Decoration only: the strip without gas (sky, stars, lines, covers) is the designed fallback.
        () => {},
      );
    return () => {
      live = false;
    };
  }, [narrow, near, count, stop]);

  const stopGas = gas?.stop === stop ? gas : null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !catalog || !positions) return;
    let raf = 0;
    // A cover that finishes decoding after this effect was cleaned up must not redraw (the callback stays queued).
    let live = true;
    // The size the strip was last drawn at: a resize notice for that same size (the observer's first) draws nothing.
    let dw = 0;
    let dh = 0;
    const draw = () => {
      if (!live) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        dw = r.width;
        dh = r.height;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const recs = recsKey ? recsKey.split(',').map(Number) : [];
        drawStrip(ctx, r.width, r.height, catalog.albums, positions[stop], { seed: focus.seed, recs }, stopGas, draw);
      });
    };
    draw();
    const ro = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (r.width !== dw || r.height !== dh) draw();
    });
    ro.observe(canvas);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [catalog, positions, stop, focus.seed, recsKey, stopGas]);

  return (
    <div className="strip" ref={box}>
      <canvas ref={ref} className="strip-canvas" role="img" aria-label={COPY.map.preview} onClick={onOpen} />
      <button type="button" className="strip-open" onClick={onOpen}>
        <span>{COPY.map.openMap}</span>
        <Icon name="fit" />
      </button>
    </div>
  );
}
