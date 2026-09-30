'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type * as THREE from 'three';
import { suppressGhostClick } from '@/lib/ghost-click';
import { markerAt } from '../state/focusLayout';
import { useMapStore } from '../state/mapStore';
import { getPlacedMarkers } from '../state/overlayEls';
import { screenToWorld } from '../state/projection';
import { albumAt } from './CursorTracker';

const MOUSE_MOVE_PX = 5;
const TOUCH_MOVE_PX = 9;
const TOUCH_MAX_MS = 500;

/** A click or tap that did not drag picks the album under it (or reports empty map). */
export function PickController({ positionsRef, hoverRef }: { positionsRef: React.RefObject<Float32Array>; hoverRef: React.RefObject<number> }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;

  useEffect(() => {
    const canvas = gl.domElement;
    let down: { x: number; y: number; t: number; id: number; type: string } | null = null;
    let pointers = 0;
    const onDown = (e: PointerEvent) => {
      pointers++;
      if (!useMapStore.getState().input.interactive || pointers > 1 || e.button > 0) {
        down = null;
        return;
      }
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, type: e.pointerType };
    };
    const onUp = (e: PointerEvent) => {
      pointers = Math.max(0, pointers - 1);
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      const touch = d.type !== 'mouse';
      if (moved > (touch ? TOUCH_MOVE_PX : MOUSE_MOVE_PX) || (touch && performance.now() - d.t > TOUCH_MAX_MS)) return;
      const rect = canvas.getBoundingClientRect();
      const store = useMapStore.getState();
      const { callbacks } = store;
      // A pick shows the card or the album under the finger: swallow the tap's follow-up mousedown and click
      // there. A tap on empty map arms nothing, so it moves focus off the focused control as usual.
      const picked = (id: number) => {
        if (touch) suppressGhostClick(e.clientX, e.clientY);
        callbacks.onPick(id);
      };
      // Focus markers first: they are drawn over the albums but take no pointer events themselves.
      // The boxes are from MarkerDriver's last frame: none count once the focus has gone.
      const marker = store.input.focus ? markerAt(getPlacedMarkers(), e.clientX - rect.left, e.clientY - rect.top, d.type) : -1;
      if (marker >= 0) {
        // The marker is about to move or unmount under a resting pointer, so end its hover now.
        store.setHoveredIndex(null);
        callbacks.onHover(null);
        picked(marker);
        return;
      }
      const [wx, wy] = screenToWorld(e.clientX, e.clientY, rect, camera);
      const id = albumAt(wx, wy, camera, rect.height, gl.getPixelRatio(), d.type, positionsRef.current, hoverRef.current);
      if (id >= 0) picked(id);
      else callbacks.onEmpty();
    };
    const onCancel = () => {
      pointers = Math.max(0, pointers - 1);
      down = null;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
    };
  }, [gl, camera, positionsRef, hoverRef]);

  return null;
}
