'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import { DURATION, easeOutCubic, prefersReducedMotion } from '@/lib/media';
import type { MapCamera } from '@/lib/types';
import { STOP_T, interpolated } from '../data';
import { useMapStore } from '../state/mapStore';
import { worldToScreen } from '../state/projection';
import { getOverviewFraming } from '../state/view';
import type { MapApi, MapPadding } from '../types';
import { clampZoom, stopCameraRig } from './CameraRig';
import { FRUSTUM_HALF_HEIGHT, applyFrustum } from './InitialFrame';

const FLY_FIT_MULTIPLE = 3.2; // zoom (relative to the overview) at which covers are fully shown
const FLY_MS = 450;
const ZOOM_STEP_MS = 240;
const MIN_FOCUS_SPAN = 0.15; // world units, so a tight cluster is not zoomed to the maximum

let control: MapApi | null = null;
/** The camera API for code outside React (CameraRig's keyboard handler). */
export const getCameraControl = (): MapApi | null => control;

/** Camera that fits `ids` inside the padded visible area (the area right of `insetPx`). applyFrustum keeps
 * `camera.position` at the centre of that area at every zoom, so the fit is computed around it. */
export function focusCamera(ids: readonly number[], positions: Float32Array, width: number, height: number, insetPx: number, pad: MapPadding): MapCamera {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const id of ids) {
    const x = positions[2 * id];
    const y = positions[2 * id + 1];
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const spanX = Math.max(x1 - x0, MIN_FOCUS_SPAN);
  const spanY = Math.max(y1 - y0, MIN_FOCUS_SPAN);
  const availW = Math.max(width - insetPx - pad.left - pad.right, 80);
  const availH = Math.max(height - pad.top - pad.bottom, 80);
  const worldH = 2 * FRUSTUM_HALF_HEIGHT;
  const zoom = clampZoom((Math.min(availW / spanX, availH / spanY) * worldH) / height);
  const wpp = worldH / (height * zoom);
  return {
    x: (x0 + x1) / 2 - ((pad.left - pad.right) / 2) * wpp,
    y: (y0 + y1) / 2 + ((pad.top - pad.bottom) / 2) * wpp,
    zoom,
  };
}

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
      const fit = getOverviewFraming().zoom;
      return { x: p[2 * id], y: p[2 * id + 1], zoom: Math.max(camera.zoom, FLY_FIT_MULTIPLE * fit) };
    };
    const focusTarget = (): MapCamera | null => {
      const { input, data } = useMapStore.getState();
      if (!input.focus || !data) return null;
      const { width, height } = get().size;
      const target = interpolated(data, STOP_T[input.stop]);
      return focusCamera([input.focus.seed, ...input.focus.recs], target, width, height, input.insetLeft, input.framePadding);
    };
    const api: MapApi = {
      zoomBy: (factor) => {
        // compound from the pending target, so repeated presses keep zooming instead of restarting from the live value
        const base = tween.current?.to ?? current();
        start({ ...base, zoom: base.zoom * factor }, ZOOM_STEP_MS);
      },
      panBy: (dx, dy) => {
        const { height } = get().size;
        const wpp = (camera.top - camera.bottom) / (height * camera.zoom);
        useMapStore.getState().registerCameraGrab();
        start({ x: camera.position.x + dx * wpp, y: camera.position.y + dy * wpp, zoom: camera.zoom }, 0);
      },
      reset: () => {
        const { input } = useMapStore.getState();
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
        return tween.current !== null || m.animating || m.nudging || m.rigMoving;
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
