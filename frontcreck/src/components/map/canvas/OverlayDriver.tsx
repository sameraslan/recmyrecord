'use client';

import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { ATLAS_PER_SHEET } from '@/lib/data/sprites';
import { renderedSpriteCssSize } from '../shaders/album';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, getOverlaySize } from '../state/overlayEls';
import { canvasRect, visibleArea, worldToScreen } from '../state/projection';
import { coverFade } from '../state/zoomLimits';
import { isAtlasSheetLoaded } from './AtlasManager';

/** Shared with MarkerDriver (Task 7). */
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
/** CSS px the hover label keeps from the edges of the visible map (shared with MarkerDriver). */
export const TIP_EDGE = 8;

/** Every rendered frame: positions the hover label and the selected-album ring (DOM, no React state). */
export function OverlayDriver({ positionsRef }: { positionsRef: React.RefObject<Float32Array> }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);

  useFrame(() => {
    const { input, hoveredIndex } = useMapStore.getState();
    const pos = positionsRef.current;
    const { width, height } = get().size;
    const rect = canvasRect(width, height);
    const toScreen = (i: number) => worldToScreen(pos[2 * i], pos[2 * i + 1], rect, camera);
    const focusIds = input.focus ? [input.focus.seed, ...input.focus.recs] : [];

    const tip = getOverlayEl('hover');
    if (tip && !(hoveredIndex !== null && focusIds.includes(hoveredIndex))) {
      if (hoveredIndex === null) tip.style.opacity = '0';
      else {
        const p = toScreen(hoveredIndex);
        // Measured by HoverLabel after each content change, so no layout read per frame.
        const { width: tw, height: th } = getOverlaySize('hover');
        let lx = p.x + 16;
        let ly = p.y - th - 12;
        if (lx + tw > width - TIP_EDGE) lx = p.x - tw - 16;
        if (ly < 8) ly = p.y + 18;
        const area = visibleArea(input.insetLeft, width, height, TIP_EDGE);
        lx = clamp(lx, area.left, area.right - tw);
        ly = clamp(ly, area.top, area.bottom - th);
        tip.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
        tip.style.opacity = '1';
      }
    }

    // Explore's hint line gives way once covers show (mockup `.zoomed .map-hint`: cover alpha above .25).
    const hint = getOverlayEl('hint');
    if (hint) {
      const zoomed = coverFade(camera.zoom, height) > 0.25 ? '1' : '0';
      if (hint.dataset.zoomed !== zoomed) hint.dataset.zoomed = zoomed;
    }

    const sel = getOverlayEl('selected');
    if (sel) {
      const i = input.selected;
      if (i === null || focusIds.includes(i)) sel.style.opacity = '0';
      else {
        const p = toScreen(i);
        // Mirrors the shader: the album is a cover only once its atlas sheet is loaded.
        const loaded = isAtlasSheetLoaded(Math.floor(i / ATLAS_PER_SHEET));
        const sprite = renderedSpriteCssSize(camera.zoom, height, gl.getPixelRatio(), 1, loaded);
        const s = Math.max(18, sprite + 8);
        sel.style.width = `${s}px`;
        sel.style.height = `${s}px`;
        sel.style.transform = `translate3d(${p.x - s / 2}px, ${p.y - s / 2}px, 0)`;
        sel.dataset.shape = loaded && coverFade(camera.zoom, height) >= 0.5 ? 'square' : 'ring';
        sel.style.opacity = '1';
      }
    }
  });

  return null;
}
