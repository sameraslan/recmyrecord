'use client';

import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { renderedSpriteCssSize } from '../shaders/album';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl } from '../state/overlayEls';
import { canvasRect, worldToScreen } from '../state/projection';
import { getOverviewFraming } from '../state/view';

/** Shared with MarkerDriver (Task 7). */
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

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
    const sprite = renderedSpriteCssSize(camera.zoom, getOverviewFraming().zoom, height, gl.getPixelRatio());
    const focusIds = input.focus ? [input.focus.seed, ...input.focus.recs] : [];

    const tip = getOverlayEl('hover');
    if (tip && !(hoveredIndex !== null && focusIds.includes(hoveredIndex))) {
      if (hoveredIndex === null) tip.style.opacity = '0';
      else {
        const p = toScreen(hoveredIndex);
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let lx = p.x + 16;
        let ly = p.y - th - 12;
        if (lx + tw > width - 8) lx = p.x - tw - 16;
        if (ly < 8) ly = p.y + 18;
        lx = clamp(lx, input.insetLeft + 8, width - tw - 8);
        ly = clamp(ly, 8, height - th - 8);
        tip.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
        tip.style.opacity = '1';
      }
    }

    const sel = getOverlayEl('selected');
    if (sel) {
      const i = input.selected;
      if (i === null || focusIds.includes(i)) sel.style.opacity = '0';
      else {
        const p = toScreen(i);
        const s = Math.max(18, sprite + 8);
        sel.style.width = `${s}px`;
        sel.style.height = `${s}px`;
        sel.style.transform = `translate3d(${p.x - s / 2}px, ${p.y - s / 2}px, 0)`;
        sel.dataset.shape = sprite >= 24 ? 'square' : 'ring';
        sel.style.opacity = '1';
      }
    }
  });

  return null;
}
