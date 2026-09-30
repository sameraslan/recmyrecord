'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { DURATION, easeOutCubic, prefersReducedMotion } from '@/lib/media';
import type { MapCamera } from '@/lib/types';
import { STOP_T, interpolated } from '../data';
import { focusCamera } from '../state/focusLayout';
import { useMapStore } from '../state/mapStore';
import { worldToScreen } from '../state/projection';
import { getOverviewFraming } from '../state/view';
import { COVER_FADE_END_PX, zoomForCoverPx } from '../state/zoomLimits';
import type { MapApi } from '../types';
import { clampZoom, stopCameraRig } from './CameraRig';
import { applyFrustum } from './InitialFrame';

const FLY_MS = 450;
const ZOOM_STEP_MS = 240;

let control: MapApi | null = null;
/** The camera API for code outside React (CameraRig's keyboard handler). */
export const getCameraControl = (): MapApi | null => control;

interface Tween {
  from: MapCamera;
  to: MapCamera;
  start: number;
  duration: number;
  startWall: number;
}

export function CameraTween({ positionsRef, initialCamera, onApi }: { positionsRef: React.RefObject<Float32Array>; initialCamera: MapCamera | null; onApi: (api: MapApi | null) => void }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const invalidate = useThree((s) => s.invalidate);
  const tween = useRef<Tween | null>(null);
  const inset = useRef({ from: 0, to: 0, start: 0, duration: 0, current: -1 });
  const appliedInitial = useRef(false);

  useEffect(() => {
    const current = (): MapCamera => ({ x: camera.position.x, y: camera.position.y, zoom: camera.zoom });
    const apply = (c: MapCamera) => {
      camera.position.x = c.x;
      camera.position.y = c.y;
      camera.zoom = c.zoom;
      camera.updateProjectionMatrix();
    };
    const start = (to: MapCamera, duration: number) => {
      stopCameraRig(); // a leftover wheel easing or fling must not pull the camera back during the tween
      const target = { ...to, zoom: clampZoom(to.zoom) };
      if (duration <= 0 || prefersReducedMotion()) {
        tween.current = null;
        apply(target);
        useMapStore.getState().setAnimating(false);
      } else {
        tween.current = { from: current(), to: target, start: performance.now(), duration, startWall: Date.now() };
        useMapStore.getState().setAnimating(true);
      }
      invalidate();
    };
    const overview = (): MapCamera => {
      const f = getOverviewFraming();
      return { x: f.center.x, y: f.center.y, zoom: f.zoom };
    };
    const flyTarget = (id: number): MapCamera => {
      const p = positionsRef.current;
      // Zoom in (never out) to where covers are fully shown.
      const covers = zoomForCoverPx(COVER_FADE_END_PX, get().size.height);
      return { x: p[2 * id], y: p[2 * id + 1], zoom: Math.max(camera.zoom, covers) };
    };
    const focusTarget = (): MapCamera | null => {
      const { input, data } = useMapStore.getState();
      if (!input.focus || !data) return null;
      const { width, height } = get().size;
      const target = interpolated(data, STOP_T[input.stop]);
      return focusCamera([input.focus.seed, ...input.focus.recs], target, width, height, input.insetLeft, input.framePadding, clampZoom);
    };
    const api: MapApi = {
      zoomBy: (factor) => {
        // compound from the pending target, so repeated presses keep zooming instead of restarting from the live value
        const base = tween.current?.to ?? current();
        // A zoom from the buttons is the visitor's own camera move: a stop change must not undo it (FocusFramer).
        useMapStore.getState().registerCameraGrab();
        start({ ...base, zoom: base.zoom * factor }, ZOOM_STEP_MS);
      },
      panBy: (dx, dy) => {
        const { height } = get().size;
        const wpp = (camera.top - camera.bottom) / (height * camera.zoom);
        useMapStore.getState().registerCameraGrab();
        start({ x: camera.position.x + dx * wpp, y: camera.position.y + dy * wpp, zoom: camera.zoom }, 0);
      },
      reset: () => {
        const { input, rearmFocus } = useMapStore.getState();
        // Back to the focus framing, and FocusFramer follows stop and inset changes again.
        if (input.focus) rearmFocus();
        start(focusTarget() ?? (input.selected !== null ? flyTarget(input.selected) : overview()), DURATION.camera);
      },
      flyTo: (id) => start(flyTarget(id), FLY_MS),
      frameFocus: (animate = true) => {
        const t = focusTarget();
        if (t) start(t, animate ? DURATION.camera : 0);
      },
      getCamera: current,
      setCamera: (c, animate = false) => start(c, animate ? DURATION.camera : 0),
      screenPoint: (id) => {
        const p = positionsRef.current;
        if (!p || id < 0 || 2 * id + 1 >= p.length) return null;
        return worldToScreen(p[2 * id], p[2 * id + 1], gl.domElement.getBoundingClientRect(), camera);
      },
      isAnimating: () => {
        const m = useMapStore.getState();
        // A stop change counts from the moment it lands in the input, before the frame that starts the morph.
        const morphPending = m.sliderT !== STOP_T[m.input.stop];
        return tween.current !== null || m.animating || m.nudging || m.rigMoving || m.morphing || morphPending;
      },
    };
    control = api;
    onApi(api);
    return () => {
      control = null;
      onApi(null);
    };
  }, [camera, gl, get, invalidate, onApi, positionsRef]);

  useEffect(() => {
    if (appliedInitial.current || !initialCamera) return;
    appliedInitial.current = true;
    control?.setCamera(initialCamera, false);
  }, [initialCamera]);

  // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
  useFrame(() => {
    const { input } = useMapStore.getState();
    const { width, height } = get().size;
    const ins = inset.current;
    if (ins.current < 0) {
      ins.current = ins.to = input.insetLeft;
      applyFrustum(camera, width, height, ins.current);
      useMapStore.getState().setInsetCurrent(ins.current);
    }
    if (input.insetLeft !== ins.to) {
      ins.from = ins.current;
      ins.to = input.insetLeft;
      ins.start = performance.now();
      ins.duration = prefersReducedMotion() ? 0 : DURATION.panel;
    }
    if (ins.current !== ins.to) {
      const p = ins.duration ? Math.min(1, (performance.now() - ins.start) / ins.duration) : 1;
      ins.current = p >= 1 ? ins.to : ins.from + (ins.to - ins.from) * easeOutCubic(p);
      applyFrustum(camera, width, height, ins.current);
      useMapStore.getState().setInsetCurrent(ins.current);
      invalidate();
    }

    const t = tween.current;
    if (!t) return;
    if (useMapStore.getState().lastCameraGrab > t.startWall) {
      tween.current = null;
      useMapStore.getState().setAnimating(false);
      return;
    }
    const p = Math.min(1, (performance.now() - t.start) / t.duration);
    const e = easeOutCubic(p);
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    camera.position.x = t.from.x + (t.to.x - t.from.x) * e;
    camera.position.y = t.from.y + (t.to.y - t.from.y) * e;
    // eslint-disable-next-line react-hooks/immutability -- three.js objects are mutated in place by design
    camera.zoom = Math.exp(Math.log(t.from.zoom) + (Math.log(t.to.zoom) - Math.log(t.from.zoom)) * e);
    camera.updateProjectionMatrix();
    if (p < 1) invalidate();
    else {
      tween.current = null;
      useMapStore.getState().setAnimating(false);
      invalidate();
    }
  });

  return null;
}
