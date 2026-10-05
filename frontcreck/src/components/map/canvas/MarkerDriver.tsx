'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { easeOutCubic, prefersReducedMotion } from '@/lib/media';
import { STOP_T, interpolated } from '../data';
import { MARKER_SIZE, MarkerLayout, layoutMarkers, type MarkerAnchor, type MarkerBounds, type MarkerItem, type PlacedMarker } from '../state/focusLayout';
import { useMapStore, type MapStore } from '../state/mapStore';
import { badgeKey, getOverlayEl, getOverlaySize, getPlacedMarkers, markerKey, setPlacedMarkers } from '../state/overlayEls';
import { canvasRect, visibleArea, worldToScreen } from '../state/projection';
import { getCameraControl } from './CameraTween';
import { frustumCamera } from './InitialFrame';
import { TIP_EDGE, clamp } from './OverlayDriver';

const HOT_SCALE = 1.16;
/** Keeps a hot marker (scaled 1.16) and its badge clear of the edges of the visible map. */
const MARKER_EDGE = 8;
/** A marker moved further than this from its album gets a leader line back to it (mockup: 6 px). */
const LEADER_MIN_PX = 6;
/** Rank badge offset from the cover's top-left corner (mockup: 6 px up and left). */
const BADGE_OFFSET = 6;
/** How long the covers take to ease onto the settled layout once a motion ends. */
export const MARKER_SETTLE_MS = 180;

/** True while the view is still on its way somewhere, so that another drawn frame is coming or the visitor still
 * holds the map: a camera tween, a fling or wheel easing, a slider morph (also the frame before it starts), a
 * bounds nudge, the album panel sliding, or a drag. */
function inMotion(s: MapStore): boolean {
  return s.animating || s.rigMoving || s.morphing || s.nudging || s.dragging || s.sliderT !== STOP_T[s.input.stop] || s.insetCurrent !== s.input.insetLeft;
}

function setLine(l: SVGLineElement, x1: number, y1: number, x2: number, y2: number) {
  l.setAttribute('x1', x1.toFixed(1));
  l.setAttribute('y1', y1.toFixed(1));
  l.setAttribute('x2', x2.toFixed(1));
  l.setAttribute('y2', y2.toFixed(1));
}

/** Writes the covers, badges, lines and leaders at `pos` (x, y per marker in rank order). DOM only. */
function writeMarkers(placed: readonly MarkerItem[], pos: Float64Array): void {
  for (let i = 0; i < placed.length; i++) {
    const it = placed[i];
    const el = getOverlayEl(markerKey(it.id));
    if (!el) continue;
    const s = el.dataset.hot === 'true' ? it.size * HOT_SCALE : it.size;
    const x0 = pos[2 * i] - s / 2;
    const y0 = pos[2 * i + 1] - s / 2;
    el.style.width = `${s}px`;
    el.style.height = `${s}px`;
    el.style.transform = `translate3d(${x0.toFixed(1)}px, ${y0.toFixed(1)}px, 0)`;
    el.style.visibility = '';
    const badge = getOverlayEl(badgeKey(it.id));
    if (badge) {
      badge.style.transform = `translate3d(${(x0 - BADGE_OFFSET).toFixed(1)}px, ${(y0 - BADGE_OFFSET).toFixed(1)}px, 0)`;
      badge.style.visibility = '';
    }
  }
  const svg = getOverlayEl<SVGSVGElement>('lines');
  if (!svg || !placed.length) return;
  const rank = (id: number) => placed.findIndex((p) => p.id === id);
  svg.querySelectorAll<SVGLineElement>('line[data-to]').forEach((l) => {
    const i = rank(Number(l.dataset.to));
    if (i >= 0) setLine(l, pos[0], pos[1], pos[2 * i], pos[2 * i + 1]);
  });
  svg.querySelectorAll<SVGLineElement>('line[data-leader]').forEach((l) => {
    const i = rank(Number(l.dataset.leader));
    const it = placed[i];
    const show = !!it && Math.hypot(pos[2 * i] - it.ax, pos[2 * i + 1] - it.ay) > LEADER_MIN_PX;
    l.style.display = show ? '' : 'none';
    if (show) setLine(l, it.ax, it.ay, pos[2 * i], pos[2 * i + 1]);
  });
}

interface Settle {
  placed: readonly MarkerItem[];
  from: Float64Array;
  to: Float64Array;
  now: Float64Array;
  start: number;
  version: number;
  raf: number;
}

interface Work {
  layout: MarkerLayout;
  anchors: MarkerAnchor[];
  bounds: MarkerBounds;
  pos: Float64Array;
  settle: Settle | null;
  /** Eases run so far (a test reads it: an album opening should need none). */
  eases: number;
  /** The focus and the tween target (x, y, zoom, inset, stop, width, height, bottom cover) last laid out for. */
  focus: unknown;
  focusAt: number;
  target: (number | string)[];
}

/** A tween that is sent elsewhere this soon after the focus changed (the album panel's inset arriving a frame
 * later, say) is still part of the opening: the layout follows it to the new view. Later reframings settle. */
const RETARGET_MS = 300;

/** The anchors and bounds of the view a running camera tween lands on, on the frames where the layout should be
 * solved for it: the focus has just changed (an album opens, a recommendation is picked), or the opening tween
 * was just sent elsewhere. Null otherwise. Allocates only then. */
function tweenTarget(w: Work, store: MapStore, width: number, height: number): { anchors: MarkerAnchor[]; bounds: MarkerBounds } | null {
  const { input, data } = store;
  const f = input.focus;
  const to = getCameraControl()?.getTarget() ?? null;
  const now = performance.now();
  const newFocus = w.focus !== f;
  if (newFocus) {
    w.focus = f;
    w.focusAt = now;
  }
  if (!to || !f || !data) {
    w.target.length = 0;
    return null;
  }
  const key = w.target;
  const fresh = [to.x, to.y, to.zoom, input.insetLeft, input.stop, width, height, input.bottomCover];
  const moved = fresh.length !== key.length || fresh.some((v, i) => v !== key[i]);
  if (moved) w.target = fresh;
  if (!newFocus && !(moved && now - w.focusAt < RETARGET_MS)) return null;
  const cam = frustumCamera(to, width, height, input.insetLeft);
  const pos = interpolated(data, STOP_T[input.stop]);
  const rect = canvasRect(width, height);
  const anchors = [f.seed, ...f.recs].map((id) => ({ id, ...worldToScreen(pos[2 * id], pos[2 * id + 1], rect, cam) }));
  const area = visibleArea(input.insetLeft, width, height, MARKER_EDGE);
  return { anchors, bounds: { ...area, bottom: Math.min(area.bottom, height - input.bottomCover - MARKER_EDGE) } };
}

/** Every rendered frame in focus mode: places the cover markers, the lines and the label of a hovered marker. The
 * layout is a MarkerLayout: steady while the view moves, settled on the fresh layout once it stops, the covers
 * easing over in the DOM (no canvas frame) unless reduced motion is asked for. */
export function MarkerDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const work = useRef<Work | null>(null);

  useEffect(() => {
    // A motion that ends after this driver's frame (a bounds nudge, pointerup on a drag) asks for the one frame
    // that settles the layout. Nothing else: a resting, settled map draws nothing.
    const unsubscribe = useMapStore.subscribe((s) => {
      if (s.input.focus && work.current?.layout.unsettled && !inMotion(s)) invalidate();
    });
    // Test hook: how far the shown layout is from a fresh solve of the same view.
    if (window.__rmr) {
      window.__rmr.markerLayout = () => {
        const w = work.current;
        if (!w || !useMapStore.getState().input.focus || w.settle) return null;
        const fresh = layoutMarkers(w.anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds: w.bounds });
        const shown = getPlacedMarkers();
        let gap = 0;
        shown.forEach((m, i) => (gap = Math.max(gap, Math.abs(m.x - fresh[i].x), Math.abs(m.y - fresh[i].y))));
        return {
          placed: shown.map((m) => ({ id: m.id, x: m.x, y: m.y, drawn: m.drawn })),
          freshGap: shown.length === fresh.length ? gap : Infinity,
          settles: w.layout.stats.settles,
          eases: w.eases,
        };
      };
    }
    return () => {
      unsubscribe();
      if (work.current?.settle) cancelAnimationFrame(work.current.settle.raf);
      // A remounted Scene must not hit-test the markers of the previous one.
      setPlacedMarkers([]);
    };
  }, [invalidate]);

  useFrame(() => {
    const store = useMapStore.getState();
    const { input, hoveredIndex, insetCurrent } = store;
    const f = input.focus;
    const w = (work.current ??= { layout: new MarkerLayout(), anchors: [], bounds: { left: 0, top: 0, right: 0, bottom: 0 }, pos: new Float64Array(0), settle: null, eases: 0, focus: null, focusAt: 0, target: [] });
    if (!f) {
      w.focus = null;
      if (w.settle) {
        cancelAnimationFrame(w.settle.raf);
        w.settle = null;
      }
      if (getPlacedMarkers().length) setPlacedMarkers([]);
      return;
    }
    const pos = positionsRef.current;
    const { width, height } = get().size;
    const rect = canvasRect(width, height);
    // The animated inset, so markers follow the map while the album panel slides.
    const inset = Math.max(0, insetCurrent);
    const area = visibleArea(inset, width, height, MARKER_EDGE);
    // Above a full-width bottom panel (the phone slider), with the same edge as elsewhere.
    const b = w.bounds;
    b.left = area.left;
    b.top = area.top;
    b.right = area.right;
    b.bottom = Math.min(area.bottom, height - input.bottomCover - MARKER_EDGE);
    const anchors = w.anchors;
    anchors.length = f.recs.length + 1;
    for (let i = 0; i < anchors.length; i++) {
      const id = i === 0 ? f.seed : f.recs[i - 1];
      const p = worldToScreen(pos[2 * id], pos[2 * id + 1], rect, camera);
      const a = anchors[i];
      if (a) {
        a.id = id;
        a.x = p.x;
        a.y = p.y;
      } else {
        anchors[i] = { id, x: p.x, y: p.y };
      }
    }
    const layout = w.layout;
    // An album opening (or the focus reframed) with a camera tween under way: lay out the view it lands on.
    const target = tweenTarget(w, store, width, height);
    const placed = layout.layout(anchors, MARKER_SIZE.seed, MARKER_SIZE.rec, { bounds: b, moving: inMotion(store), target: target ?? undefined });
    const n = placed.length;
    if (w.pos.length !== 2 * n) w.pos = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      w.pos[2 * i] = placed[i].x;
      w.pos[2 * i + 1] = placed[i].y;
    }

    if (w.settle && w.settle.version !== layout.version) {
      // The layout changed again (a new motion): drop the ease and follow it.
      cancelAnimationFrame(w.settle.raf);
      w.settle = null;
    }
    if (layout.settledFrom && layout.settledFrom.length === 2 * n && !prefersReducedMotion()) {
      const s: Settle = { placed, from: layout.settledFrom, to: Float64Array.from(w.pos), now: new Float64Array(2 * n), start: performance.now(), version: layout.version, raf: 0 };
      const step = () => {
        const p = Math.min(1, (performance.now() - s.start) / MARKER_SETTLE_MS);
        const e = easeOutCubic(p);
        for (let i = 0; i < s.now.length; i++) s.now[i] = s.from[i] + (s.to[i] - s.from[i]) * e;
        writeMarkers(s.placed, s.now);
        if (p < 1) s.raf = requestAnimationFrame(step);
        else if (w.settle === s) w.settle = null;
      };
      s.now.set(s.from);
      s.raf = requestAnimationFrame(step);
      w.settle = s;
      w.eases++;
    }

    const drawn: PlacedMarker[] = [];
    for (const it of placed) {
      const el = getOverlayEl(markerKey(it.id));
      drawn.push({ ...it, drawn: el?.dataset.hot === 'true' ? it.size * HOT_SCALE : it.size });
    }
    // Hover and pick hit-test these boxes (CursorTracker, PickController): the markers take no pointer events.
    setPlacedMarkers(drawn);
    // While the covers ease onto a settled layout, the frame draws them where the ease has them.
    writeMarkers(placed, w.settle ? w.settle.now : w.pos);

    const tip = getOverlayEl('hover');
    const it = hoveredIndex === null ? undefined : placed.find((p) => p.id === hoveredIndex);
    if (tip && it) {
      // Measured by HoverLabel after each content change, so no layout read per frame.
      const { width: tw, height: th } = getOverlaySize('hover');
      const area = visibleArea(inset, width, height, TIP_EDGE);
      const half = (drawn.find((d) => d.id === it.id)?.drawn ?? it.size) / 2;
      let lx = it.x + half + 14;
      if (lx + tw > area.right) lx = it.x - half - 14 - tw;
      lx = clamp(lx, area.left, area.right - tw);
      const ly = clamp(it.y - th / 2, area.top, area.bottom - th);
      tip.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
      tip.style.opacity = '1';
    }
  });

  return null;
}
