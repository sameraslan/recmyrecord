'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/Icon';
import { TILE } from '@/components/Cover';
import { STAR_WHITE } from '@/components/map/theme';
import { MARKER_GAP, layoutMarkers } from '@/components/map/state/focusLayout';
import { COPY } from '@/lib/copy';
import { coverUrl } from '@/lib/data/catalog';
import { useCatalog, usePositions } from '@/lib/data/useData';
import { useIsNarrow } from '@/lib/media';
import type { AlbumRecord, Focus, StopId } from '@/lib/types';

/** Stand-in until the strip is restyled (Trifid plan part 3): every dot in star white at the strip's lower opacity. */
const DOT = [0, 1, 2].map(() => `rgba(${STAR_WHITE.join(',')},.42)`);
/** Strip covers are smaller than the map's markers (64 / 46): the mockup's compact MapView sizes. */
const STRIP_SEED = 38;
const STRIP_REC = 28;
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

/** Mockup's compact MapView: nearby dots, lines, small covers (seed 38 px, recs 28 px, kept inside the canvas)
 * and rank badges drawn last, so no cover hides one. */
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  albums: readonly AlbumRecord[],
  pos: readonly number[],
  focus: Focus,
  accent: string,
  onReady: () => void,
): void {
  ctx.clearRect(0, 0, w, h);
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
  for (let c = 0; c < 3; c++) {
    ctx.beginPath();
    for (let i = 0; i < albums.length; i++) {
      if (albums[i].k % 3 !== c) continue;
      const x = sx(pos[2 * i]);
      const y = sy(pos[2 * i + 1]);
      if (x < -4 || y < -4 || x > w + 4 || y > h + 4) continue;
      ctx.moveTo(x + 1.3, y);
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    }
    ctx.fillStyle = DOT[c];
    ctx.fill();
  }
  const placed = layoutMarkers(ids.map((id) => ({ id, x: sx(pos[2 * id]), y: sy(pos[2 * id + 1]) })), STRIP_SEED, STRIP_REC, {
    // 6 px: room for the badges (4 px out, top-left) and the seed's ring (5 px out).
    bounds: { left: 6, top: 6, right: w - 6, bottom: h - 6 },
    gap: MARKER_GAP,
  });
  ctx.strokeStyle = 'rgba(237,229,213,.22)';
  ctx.lineWidth = 1;
  for (const it of placed.slice(1)) {
    ctx.beginPath();
    ctx.moveTo(placed[0].x, placed[0].y);
    ctx.lineTo(it.x, it.y);
    ctx.stroke();
  }
  for (const it of [...placed.slice(1), placed[0]]) {
    const a = albums[it.id];
    const s = it.size;
    const x = it.x - s / 2;
    const y = it.y - s / 2;
    const url = coverUrl(a.c, s);
    const im = url ? readyImage(url, onReady) : null;
    if (im) ctx.drawImage(im, x, y, s, s);
    else {
      ctx.fillStyle = TILE[a.k % 3];
      ctx.fillRect(x, y, s, s);
    }
    ctx.strokeStyle = it.seed ? accent : 'rgba(237,229,213,.28)';
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
    ctx.fillStyle = '#1a1511';
    ctx.fillRect(bx, by, b, b);
    ctx.strokeStyle = 'rgba(237,229,213,.35)';
    ctx.strokeRect(bx + 0.5, by + 0.5, b - 1, b - 1);
    ctx.fillStyle = '#ede5d5';
    ctx.fillText(String(it.rank), bx + b / 2, by + b / 2 + 0.5);
  }
}

export function MapPreviewStrip({ focus, stop, onOpen }: { focus: Focus; stop: StopId; onOpen: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The strip only exists under 900 px; on wider screens it is display:none, so load nothing for it there.
  const narrow = useIsNarrow();
  const { catalog } = useCatalog(narrow);
  const { positions } = usePositions(narrow);
  const recsKey = focus.recs.join(',');

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !catalog || !positions) return;
    let raf = 0;
    // A cover that finishes decoding after this effect was cleaned up must not redraw (the callback stays queued).
    let live = true;
    const draw = () => {
      if (!live) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#d9a066';
        const recs = recsKey ? recsKey.split(',').map(Number) : [];
        drawStrip(ctx, r.width, r.height, catalog.albums, positions[stop], { seed: focus.seed, recs }, accent, draw);
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [catalog, positions, stop, focus.seed, recsKey]);

  return (
    <div className="strip">
      <canvas ref={ref} className="strip-canvas" role="img" aria-label={COPY.map.preview} onClick={onOpen} />
      <button type="button" className="strip-open" onClick={onOpen}>
        <span>{COPY.map.openMap}</span>
        <Icon name="fit" />
      </button>
    </div>
  );
}
