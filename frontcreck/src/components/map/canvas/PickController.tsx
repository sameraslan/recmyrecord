'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type * as THREE from 'three';
import { suppressGhostClick } from '@/lib/ghost-click';
import { useMapStore } from '../state/mapStore';
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
      const [wx, wy] = screenToWorld(e.clientX, e.clientY, rect, camera);
      const id = albumAt(wx, wy, camera, rect.height, gl.getPixelRatio(), d.type, positionsRef.current, hoverRef.current);
      const { callbacks } = useMapStore.getState();
      if (touch) suppressGhostClick(e.clientX, e.clientY); // the card or album may appear under the finger
      if (id >= 0) callbacks.onPick(id);
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
