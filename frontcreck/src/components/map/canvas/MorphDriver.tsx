'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { DURATION, easeInOutCubic, prefersReducedMotion } from '@/lib/media';
import { STOP_T } from '../data';
import { useMapStore } from '../state/mapStore';

/** Animates u_sliderT to the current stop (520 ms ease-in-out; instant under reduced motion or on first frame). */
export function MorphDriver() {
  const invalidate = useThree((s) => s.invalidate);
  const anim = useRef<{ from: number; to: number; start: number } | null>(null);
  const started = useRef(false);

  useFrame(() => {
    const store = useMapStore.getState();
    const target = STOP_T[store.input.stop];
    if (!started.current) {
      started.current = true;
      if (store.sliderT !== target) store.setSliderT(target);
      return;
    }
    if (store.sliderT !== target && anim.current?.to !== target) {
      if (prefersReducedMotion()) {
        anim.current = null;
        store.setMorphing(false);
        store.setSliderT(target);
        return;
      }
      anim.current = { from: store.sliderT, to: target, start: performance.now() };
      store.setMorphing(true);
    }
    const a = anim.current;
    if (!a) return;
    const p = Math.min(1, (performance.now() - a.start) / DURATION.morph);
    // Land exactly on the target, or the next frame would see a tiny difference and start another morph.
    store.setSliderT(p >= 1 ? a.to : a.from + (a.to - a.from) * easeInOutCubic(p));
    if (p < 1) invalidate();
    else {
      anim.current = null;
      store.setMorphing(false);
    }
  });

  return null;
}
