'use client';

import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { MARKER_SIZE, layoutMarkers } from '../state/focusLayout';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, getOverlaySize, markerKey } from '../state/overlayEls';
import { canvasRect, visibleArea, worldToScreen } from '../state/projection';
import { TIP_EDGE, clamp } from './OverlayDriver';

const HOT_SCALE = 1.16;
/** Keeps a hot marker (scaled 1.16) and its badge clear of the edges of the visible map. */
const MARKER_EDGE = 8;
/** A marker moved further than this from its album gets a leader line back to it (mockup: 6 px). */
const LEADER_MIN_PX = 6;

function setLine(l: SVGLineElement, x1: number, y1: number, x2: number, y2: number) {
  l.setAttribute('x1', x1.toFixed(1));
  l.setAttribute('y1', y1.toFixed(1));
  l.setAttribute('x2', x2.toFixed(1));
  l.setAttribute('y2', y2.toFixed(1));
}

/** Every rendered frame in focus mode: places the cover markers, the lines and the label of a hovered marker. */
export function MarkerDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const get = useThree((s) => s.get);

  useFrame(() => {
    const { input, hoveredIndex, insetCurrent } = useMapStore.getState();
    const f = input.focus;
    if (!f) return;
    const pos = positionsRef.current;
    const { width, height } = get().size;
    const rect = canvasRect(width, height);
    // The animated inset, so markers follow the map while the album panel slides.
    const inset = Math.max(0, insetCurrent);
    const placed = layoutMarkers(
      [f.seed, ...f.recs].map((id) => ({ id, ...worldToScreen(pos[2 * id], pos[2 * id + 1], rect, camera) })),
      MARKER_SIZE.seed,
      MARKER_SIZE.rec,
      { bounds: visibleArea(inset, width, height, MARKER_EDGE) },
    );
    for (const it of placed) {
      const el = getOverlayEl(markerKey(it.id));
      if (!el) continue;
      const s = el.dataset.hot === 'true' ? it.size * HOT_SCALE : it.size;
      el.style.width = `${s}px`;
      el.style.height = `${s}px`;
      el.style.transform = `translate3d(${(it.x - s / 2).toFixed(1)}px, ${(it.y - s / 2).toFixed(1)}px, 0)`;
    }
    const svg = getOverlayEl<SVGSVGElement>('lines');
    if (svg && placed.length) {
      const seed = placed[0];
      const byId = new Map(placed.map((p) => [p.id, p]));
      svg.querySelectorAll<SVGLineElement>('line[data-to]').forEach((l) => {
        const it = byId.get(Number(l.dataset.to));
        if (it) setLine(l, seed.x, seed.y, it.x, it.y);
      });
      svg.querySelectorAll<SVGLineElement>('line[data-leader]').forEach((l) => {
        const it = byId.get(Number(l.dataset.leader));
        const show = !!it && Math.hypot(it.x - it.ax, it.y - it.ay) > LEADER_MIN_PX;
        l.style.display = show ? '' : 'none';
        if (show && it) setLine(l, it.ax, it.ay, it.x, it.y);
      });
    }
    const tip = getOverlayEl('hover');
    const it = hoveredIndex === null ? undefined : placed.find((p) => p.id === hoveredIndex);
    if (tip && it) {
      // Measured by HoverLabel after each content change, so no layout read per frame.
      const { width: tw, height: th } = getOverlaySize('hover');
      const area = visibleArea(inset, width, height, TIP_EDGE);
      const half = (it.size * (it.seed ? 1 : HOT_SCALE)) / 2;
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
