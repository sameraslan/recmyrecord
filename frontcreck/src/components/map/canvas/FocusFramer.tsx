'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useMapStore, type MapStore } from '../state/mapStore';
import { getCameraControl } from './CameraTween';

function focusKey(s: MapStore): string {
  const f = s.input.focus;
  if (!f) return '';
  const p = s.input.framePadding;
  return `${f.seed}|${f.recs.join(',')}|${s.input.stop}|${s.input.insetLeft}|${p.top},${p.right},${p.bottom},${p.left}`;
}

/** Frames the seed and visible recommendations whenever they, the stop, the inset or the padding change,
 * unless the user has moved the camera since this seed was focused or since the last Reset
 * (`focusRearmedAt`). A new seed always frames. */
export function FocusFramer() {
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const last = useRef<{ key: string; seed: number | null; since: number }>({ key: '', seed: null, since: 0 });

  useEffect(() => {
    const onChange = (s: MapStore) => {
      const key = focusKey(s);
      if (key === last.current.key) return;
      const seed = s.input.focus?.seed ?? null;
      if (seed === null) {
        last.current = { key: '', seed: null, since: 0 };
        return;
      }
      const newSeed = seed !== last.current.seed;
      const userMoved = !newSeed && s.lastCameraGrab > Math.max(last.current.since, s.focusRearmedAt);
      last.current = { key, seed, since: newSeed ? Date.now() : last.current.since };
      if (!userMoved) getCameraControl()?.frameFocus(true);
    };
    onChange(useMapStore.getState());
    return useMapStore.subscribe(onChange);
  }, []);

  useEffect(() => {
    const s = useMapStore.getState();
    if (s.input.focus && s.lastCameraGrab <= Math.max(last.current.since, s.focusRearmedAt)) getCameraControl()?.frameFocus(false);
  }, [width, height]);

  return null;
}
