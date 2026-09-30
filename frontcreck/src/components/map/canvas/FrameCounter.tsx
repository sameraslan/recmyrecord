'use client';

import { useFrame } from '@react-three/fiber';

/** Counts rendered frames for the demand-rendering test and the perf script. */
export function FrameCounter() {
  useFrame(() => {
    if (window.__rmr) window.__rmr.frames = (window.__rmr.frames ?? 0) + 1;
  });
  return null;
}
