'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { easeOutCubic, prefersReducedMotion } from '@/lib/media';
import { STOP_T, interpolated } from '../data';
import { HOT_FRAME_PX, MARKER_SIZE, MarkerLayout, REC_FRAME_PX, SEED_FRAME_PX, layoutMarkers, type MarkerAnchor, type MarkerBounds, type MarkerItem, type PlacedMarker } from '../state/focusLayout';
import { useMapStore, type MapStore } from '../state/mapStore';
import { inMotion } from '../state/motion';
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
/** Rank badge offset from the cover's top-left corner (prototype: 0.4 of the 18 px badge, up and left). */
const BADGE_OFFSET = 7;
/** How long the covers take to ease onto the settled layout once a motion ends. */
export const MARKER_SETTLE_MS = 180;
/** A tween that is sent elsewhere this soon after the focus changed (the album panel's inset arriving a frame
 * later, say) is still part of the opening: the layout follows it to the new view. Later reframings settle. */
const RETARGET_MS = 300;

/** Per line, what `paint` last wrote: x1, y1, x2, y2 in tenths of a px, then 1 shown or 0 hidden (leaders). */
const LINE_SLOTS = 5;
const LINE_ATTRS = ['x1', 'y1', 'x2', 'y2'] as const;

/** Puts the j-th white core and the dark casing under it on the same segment, to a tenth of a px. An end that
 * has not moved by a tenth is not written again, so a frame in which nothing moved writes nothing. */
function setLines(w: Work, j: number, core: SVGLineElement, casing: SVGLineElement | undefined, x1: number, y1: number, x2: number, y2: number) {
  const last = w.lineAt;
  const o = LINE_SLOTS * j;
  for (let a = 0; a < 4; a++) {
    const tenths = Math.round((a === 0 ? x1 : a === 1 ? y1 : a === 2 ? x2 : y2) * 10);
    if (last[o + a] === tenths) continue;
    last[o + a] = tenths;
    const v = String(tenths / 10);
    core.setAttribute(LINE_ATTRS[a], v);
    if (casing) casing.setAttribute(LINE_ATTRS[a], v);
  }
}

/** The fraction of the step (dx, dy) at which it leaves a square of half side `half` centred on its start: the
 * point `edgePoint` (focusLayout) gives, as one number, so that paint allocates nothing for it. */
function edgeT(dx: number, dy: number, half: number): number {
  return half / (Math.max(Math.abs(dx), Math.abs(dy)) || 1);
}

/** Half the side of a marker's cover plus its frame (the seed's ring, a hot ring, a hairline): where its lines end. */
function frameHalf(it: PlacedMarker): number {
  return it.drawn / 2 + (it.seed ? SEED_FRAME_PX : it.drawn !== it.size ? HOT_FRAME_PX : REC_FRAME_PX);
}

function markerOf(drawn: readonly PlacedMarker[], id: number): PlacedMarker | undefined {
  for (let i = 0; i < drawn.length; i++) if (drawn[i].id === id) return drawn[i];
  return undefined;
}

interface Settle {
  from: Float64Array;
  to: Float64Array;
  start: number;
  version: number;
  raf: number;
}

interface Work {
  layout: MarkerLayout;
  anchors: MarkerAnchor[];
  bounds: MarkerBounds;
  /** The last layout, where its markers are drawn (eased while settling), and the boxes published for hits. */
  placed: readonly MarkerItem[];
  shown: Float64Array;
  drawn: PlacedMarker[];
  /** What the lines were last given (LINE_SLOTS numbers a line) and the elements that got it (core, casing):
   * NaN, and written afresh, for a line React has replaced. */
  lineAt: Float64Array;
  lineEls: (Element | undefined)[];
  /** What the hover label is kept inside, as of the last frame. */
  inset: number;
  width: number;
  height: number;
  settle: Settle | null;
  /** Eases run so far (a test reads it: an album opening should need none). */
  eases: number;
  /** The focus and the tween target (x, y, zoom, inset, stop, width, height, bottom cover) last laid out for. */
  focus: unknown;
  focusAt: number;
  target: Float64Array;
  hasTarget: boolean;
  /** A settle frame is already asked for this task. */
  asked: boolean;
}

/** Draws the covers, badges, lines and leaders where `w.shown` has them, publishes those boxes for hover and
 * pick, and places the hover label beside the hovered one. DOM only: a frame and each step of an ease call it. */
function paint(w: Work): void {
  const placed = w.placed;
  const pos = w.shown;
  if (w.drawn.length !== placed.length) w.drawn = placed.map((it) => ({ ...it, drawn: it.size }));
  for (let i = 0; i < placed.length; i++) {
    const it = placed[i];
    const el = getOverlayEl(markerKey(it.id));
    const s = el?.dataset.hot === 'true' ? it.size * HOT_SCALE : it.size;
    // Hover and pick hit-test these boxes (CursorTracker, PickController): the markers take no pointer events.
    const d = w.drawn[i];
    Object.assign(d, it);
    d.x = pos[2 * i];
    d.y = pos[2 * i + 1];
    d.drawn = s;
    if (!el) continue;
    const x0 = d.x - s / 2;
    const y0 = d.y - s / 2;
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
  setPlacedMarkers(w.drawn);
  const drawn = w.drawn;
  const svg = getOverlayEl<SVGSVGElement>('lines');
  if (svg && drawn.length && svg.children.length === 2) {
    const seed = drawn[0];
    const seedHalf = frameHalf(seed);
    // FocusMarkers renders the casings (g.mk-case) and the cores (g.mk-core) in the same order: the j-th casing
    // lies under the j-th core. The live child lists are walked in place (no query, no list built per frame).
    const cases = svg.children[0].children;
    const cores = svg.children[1].children;
    // Resized only when the number of lines changes (ten albums in place of five).
    if (w.lineAt.length !== LINE_SLOTS * cores.length) {
      w.lineAt = new Float64Array(LINE_SLOTS * cores.length).fill(NaN);
      w.lineEls.length = 0;
    }
    const last = w.lineAt;
    const els = w.lineEls;
    for (let j = 0; j < cores.length; j++) {
      const core = cores[j] as SVGLineElement;
      const casing = cases[j] as SVGLineElement | undefined;
      if (els[2 * j] !== core || els[2 * j + 1] !== casing) {
        els[2 * j] = core;
        els[2 * j + 1] = casing;
        last.fill(NaN, LINE_SLOTS * j, LINE_SLOTS * (j + 1));
      }
      const to = core.dataset.to;
      if (to !== undefined) {
        // From the edge of the seed's frame to the edge of the recommendation's frame, along the two centres.
        const it = markerOf(drawn, Number(to));
        if (!it) continue;
        const dx = it.x - seed.x;
        const dy = it.y - seed.y;
        const a = edgeT(dx, dy, seedHalf);
        const b = edgeT(dx, dy, frameHalf(it));
        setLines(w, j, core, casing, seed.x + dx * a, seed.y + dy * a, it.x - dx * b, it.y - dy * b);
        continue;
      }
      // A thin leader from a moved cover's frame back to the album's true position (the shader draws a ring
      // there); none while the true position is still under the cover or its frame.
      const it = markerOf(drawn, Number(core.dataset.leader));
      const dx = it ? it.ax - it.x : 0;
      const dy = it ? it.ay - it.y : 0;
      const half = it ? frameHalf(it) : 0;
      const show = !!it && Math.hypot(dx, dy) > LEADER_MIN_PX && Math.max(Math.abs(dx), Math.abs(dy)) > half;
      const flag = show ? 1 : 0;
      if (last[LINE_SLOTS * j + 4] !== flag) {
        last[LINE_SLOTS * j + 4] = flag;
        const display = show ? '' : 'none';
        core.style.display = display;
        if (casing) casing.style.display = display;
      }
      if (show && it) {
        const t = edgeT(dx, dy, half);
        setLines(w, j, core, casing, it.x + dx * t, it.y + dy * t, it.ax, it.ay);
      }
    }
  }
  const tip = getOverlayEl('hover');
  const hovered = useMapStore.getState().hoveredIndex;
  const it = hovered === null ? undefined : drawn.find((p) => p.id === hovered);
  if (tip && it) {
    // Measured by HoverLabel after each content change, so no layout read per frame.
    const { width: tw, height: th } = getOverlaySize('hover');
    const area = visibleArea(w.inset, w.width, w.height, TIP_EDGE);
    const half = it.drawn / 2;
    let lx = it.x + half + 14;
    if (lx + tw > area.right) lx = it.x - half - 14 - tw;
    lx = clamp(lx, area.left, area.right - tw);
    const ly = clamp(it.y - th / 2, area.top, area.bottom - th);
    tip.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
    tip.style.opacity = '1';
  }
}

/** The anchors and bounds of the view a running camera tween lands on, on the frames where the layout should be
 * solved for it: the focus has just changed (an album opens, a recommendation is picked), or the opening tween
 * was just sent elsewhere. Null otherwise. It compares the target in place and allocates only when it returns
 * one (once per album open or reframing). */
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
    w.hasTarget = false;
    return null;
  }
  const k = w.target;
  const stop = STOP_T[input.stop];
  const moved = !w.hasTarget || k[0] !== to.x || k[1] !== to.y || k[2] !== to.zoom || k[3] !== input.insetLeft || k[4] !== stop || k[5] !== width || k[6] !== height || k[7] !== input.bottomCover;
  if (moved) {
    k[0] = to.x;
    k[1] = to.y;
    k[2] = to.zoom;
    k[3] = input.insetLeft;
    k[4] = stop;
    k[5] = width;
    k[6] = height;
    k[7] = input.bottomCover;
    w.hasTarget = true;
  }
  if (!newFocus && !(moved && now - w.focusAt < RETARGET_MS)) return null;
  const cam = frustumCamera(to, width, height, input.insetLeft);
  const pos = interpolated(data, stop);
  const rect = canvasRect(width, height);
  const anchors = [f.seed, ...f.recs].map((id) => ({ id, ...worldToScreen(pos[2 * id], pos[2 * id + 1], rect, cam) }));
  const area = visibleArea(input.insetLeft, width, height, MARKER_EDGE);
  return { anchors, bounds: { ...area, bottom: Math.min(area.bottom, height - input.bottomCover - MARKER_EDGE) } };
}

function stopSettle(w: Work): void {
  if (w.settle) cancelAnimationFrame(w.settle.raf);
  w.settle = null;
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
    // A motion that ends outside a drawn frame (pointerup on a drag or a pinch, a bounds nudge that ends after
    // this driver's frame) asks for the one frame that settles the layout. Checked once the current task is
    // over: a motion that ends inside a frame (a tween, wheel easing, a fling) has settled in that same frame by
    // then, and asks for nothing. A resting, settled map draws nothing.
    const check = () => {
      const w = work.current;
      if (w) w.asked = false;
      const s = useMapStore.getState();
      if (s.input.focus && w?.layout.unsettled && !inMotion(s)) invalidate();
    };
    const unsubscribe = useMapStore.subscribe((s) => {
      const w = work.current;
      if (!s.input.focus || !w?.layout.unsettled || w.asked || inMotion(s)) return;
      w.asked = true;
      queueMicrotask(check);
    });
    // Test hook: how far the shown layout is from a fresh solve of the same view.
    const hook = () => {
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
    if (window.__rmr) window.__rmr.markerLayout = hook;
    return () => {
      unsubscribe();
      if (work.current) stopSettle(work.current);
      if (window.__rmr?.markerLayout === hook) delete window.__rmr.markerLayout;
      // A remounted Scene must not hit-test the markers of the previous one.
      setPlacedMarkers([]);
    };
  }, [invalidate]);

  useFrame(() => {
    const store = useMapStore.getState();
    const { input, insetCurrent } = store;
    const f = input.focus;
    const w = (work.current ??= {
      layout: new MarkerLayout(),
      anchors: [],
      bounds: { left: 0, top: 0, right: 0, bottom: 0 },
      placed: [],
      shown: new Float64Array(0),
      drawn: [],
      lineAt: new Float64Array(0),
      lineEls: [],
      inset: 0,
      width: 0,
      height: 0,
      settle: null,
      eases: 0,
      focus: null,
      focusAt: 0,
      target: new Float64Array(8),
      hasTarget: false,
      asked: false,
    });
    if (!f) {
      w.focus = null;
      stopSettle(w);
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
    w.placed = placed;
    w.inset = inset;
    w.width = width;
    w.height = height;
    if (w.shown.length !== 2 * n) w.shown = new Float64Array(2 * n);

    // The layout changed again (a new motion): drop the ease and follow it.
    if (w.settle && w.settle.version !== layout.version) stopSettle(w);
    if (layout.settledFrom && layout.settledFrom.length === 2 * n && !prefersReducedMotion()) {
      const to = new Float64Array(2 * n);
      for (let i = 0; i < n; i++) {
        to[2 * i] = placed[i].x;
        to[2 * i + 1] = placed[i].y;
      }
      const s: Settle = { from: layout.settledFrom, to, start: performance.now(), version: layout.version, raf: 0 };
      const step = () => {
        if (w.settle !== s) return;
        const p = Math.min(1, (performance.now() - s.start) / MARKER_SETTLE_MS);
        const e = easeOutCubic(p);
        for (let i = 0; i < s.to.length; i++) w.shown[i] = s.from[i] + (s.to[i] - s.from[i]) * e;
        paint(w);
        if (p < 1) s.raf = requestAnimationFrame(step);
        else w.settle = null;
      };
      w.shown.set(s.from);
      s.raf = requestAnimationFrame(step);
      w.settle = s;
      w.eases++;
    } else if (!w.settle) {
      for (let i = 0; i < n; i++) {
        w.shown[2 * i] = placed[i].x;
        w.shown[2 * i + 1] = placed[i].y;
      }
    }
    // While the covers ease onto a settled layout, the frame draws them (and their hit boxes) where the ease is.
    paint(w);
  });

  return null;
}
