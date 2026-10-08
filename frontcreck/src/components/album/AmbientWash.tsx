'use client';

import { useEffect, useState } from 'react';
import { hexToRgb } from '@/lib/color';
import type { Ambient } from '@/lib/types';

const rgba = (hex: string, a: number) => `rgba(${hexToRgb(hex).join(',')},${a})`;

/** The album panel's wash: the album's first two colours. */
export function ambientBackground(a: Ambient): string {
  return `radial-gradient(60% 70% at 16% 20%, ${rgba(a[0], 0.85)}, transparent 72%), radial-gradient(55% 60% at 88% 6%, ${rgba(a[1], 0.8)}, transparent 70%)`;
}

/** Last wash shown. The album page remounts on every album (Next keys the [slug] segment),
 * so a new panel starts from the previous album's wash and cross-fades from it. */
let last: { key: string; bg: string } = { key: '', bg: 'none' };

/** Two stacked layers: each new ambient goes to the other layer, which fades in (CSS animation, .42 s)
 * while the old one fades out. */
export function AmbientLayers({ ambient }: { ambient: Ambient | null }) {
  const key = ambient ? ambient.join() : '';
  const bgFor = (a: Ambient | null) => (a ? ambientBackground(a) : 'none');
  // A new mount starts from the wash last shown (layer 0) and fades the new one in on layer 1.
  const [state, setState] = useState<{ key: string; bg: [string, string]; on: 0 | 1 }>(() =>
    last.key === key ? { key, bg: [last.bg, 'none'], on: 0 } : { key, bg: [last.bg, bgFor(ambient)], on: 1 },
  );
  if (state.key !== key) {
    // Adjusting state while rendering (React's pattern for deriving from a changed prop): the other layer takes the new wash.
    const on: 0 | 1 = state.on === 0 ? 1 : 0;
    const bg: [string, string] = [...state.bg];
    bg[on] = bgFor(ambient);
    setState({ key, bg, on });
  }
  useEffect(() => {
    last = { key: state.key, bg: state.bg[state.on] };
  }, [state]);
  return (
    <div className="amb" aria-hidden="true">
      <i className={state.on === 0 ? 'on' : 'off'} style={{ background: state.bg[0] }} />
      <i className={state.on === 1 ? 'on' : 'off'} style={{ background: state.bg[1] }} />
    </div>
  );
}
