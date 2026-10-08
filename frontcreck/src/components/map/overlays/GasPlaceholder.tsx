'use client';

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { GAS_PLACEHOLDER_BALANCED, THEME_BAKE } from '@/lib/data/theme.generated';
import type { View } from '@/lib/url-state';
import { DESKTOP_FIT_PADDING, PHONE_FIT_PADDING, PHONE_SLIDER_COVER_FALLBACK_PX } from '../framing';
import { MAP_REVEAL_FADE_MS, getMapReveal, subscribeMapReveal, type MapReveal } from '../state/reveal';

/**
 * The stand-in nebula: what the map pane shows from the server HTML's first paint until the map has drawn, so the
 * pane is never an empty near-black box. A soft copy of the default stop's gas, about a kilobyte, inline
 * (theme.generated.ts), placed where the map will draw the real one, so the real one reads as the same picture
 * coming into focus. The canvas lies over it and is see-through until it draws (state/reveal.ts).
 *
 * Where it goes follows from the window's size alone, so it is placed in CSS (styles/map.css `.gas-ph`), before
 * any script runs. The two framings a page can open at, both of state/bounds.ts:
 *   'fit'   Home, About and 404 open at the Whole map (fitView): the cloud's extent fitted into the area below
 *           the header less the fit padding. An <svg> whose viewBox is that extent, filling that area, does the
 *           same fit (preserveAspectRatio "meet"), and the picture hangs in it at the gas's own rectangle.
 *   'over'  /map opens at the Overview (fitOverview): the 1st to 99th percentile span across the width less 24 px a
 *           side (a phone: 1.8 times closer), the median row in the middle of what is below the header (a phone:
 *           and above the slider panel). The viewBox is that span and has almost no height, so it fits by width.
 *   'glow'  An album page frames its own album, wherever that is: no picture could be placed, so the pane gets a
 *           soft glow in the nebula's mean tone instead. Windows too short for the two fits get it too.
 * The numbers are the map's own: the paddings from ../framing, the layout's extents from theme.generated.ts, and
 * the Overview's three constants, repeated below because state/bounds.ts belongs to the map's chunk
 * (GasPlaceholder.test.tsx keeps them equal). e2e/first-frame.spec.ts measures the picture against the drawn map.
 *
 * It goes away by itself: taken out once the canvas has faded in over it with the nebula ('gas'), or faded out
 * when no nebula will come ('sky') or there is no WebGL (`off`: the pane is then the plain sky, as it was; a soft
 * nebula with no map over it would promise one). After that it is not in the document and costs nothing.
 */

/** The Overview's side padding, how much closer a phone opens, and the cover sizes (CSS px) its two caps stand for
 * over the cover's size in world units: OVERVIEW_SIDE_PAD_PX, OVERVIEW_NARROW_CLOSER, OVERVIEW_COVER_MAX_PX,
 * OVERVIEW_NARROW_COVER_PX (state/bounds.ts) and COVER_WORLD (state/zoomLimits.ts). */
export const OVER = { sidePad: 24, narrowCloser: 1.8, coverMaxPx: 12.5, narrowCoverPx: 5.2, coverWorld: 0.0068 } as const;

/** <svg> units per world unit: whole numbers in the markup. */
const U = 1000;
const r = (v: number): number => Math.round(v * U * 100) / 100;

const BAKE = THEME_BAKE.stops.balanced;

/** The pieces of the stand-in for a view, pure so they can be checked: which kind, the <svg> viewBox, the picture's
 * box in it, and the custom properties the stylesheet places it with. */
export function placeholderLayout(view: View): { kind: 'fit' | 'over' | 'glow'; viewBox: string | null; image: { x: number; y: number; width: number; height: number }; vars: Record<string, string> } {
  const [west, south, east, north] = BAKE.gas;
  // The picture is stored upright and <svg> y runs down: north is the top.
  const image = { x: r(west), y: r(-north), width: r(east - west), height: r(north - south) };
  const vars: Record<string, string> = { '--tone': BAKE.tone.join(' ') };
  if (view === 'album') return { kind: 'glow', viewBox: null, image, vars };
  if (view === 'explore') {
    const [x1, x99, medY] = BAKE.span;
    const span = x99 - x1;
    return {
      kind: 'over',
      viewBox: `${r(x1)} ${r(-medY) - 0.5} ${r(span)} 1`,
      image,
      vars: {
        ...vars,
        '--pad': `${OVER.sidePad}px`,
        '--closer': String(OVER.narrowCloser),
        // The widths of the span at the two caps of the Overview's zoom.
        '--max': `${Math.round((OVER.coverMaxPx / OVER.coverWorld) * span)}px`,
        '--nmax': `${Math.round((OVER.narrowCoverPx / OVER.coverWorld) * span)}px`,
        '--cover': `${PHONE_SLIDER_COVER_FALLBACK_PX}px`,
      },
    };
  }
  const [minX, minY, maxX, maxY] = BAKE.cloud;
  const d = DESKTOP_FIT_PADDING;
  const p = PHONE_FIT_PADDING;
  return {
    kind: 'fit',
    viewBox: `${r(minX)} ${r(-maxY)} ${r(maxX - minX)} ${r(maxY - minY)}`,
    image,
    vars: { ...vars, '--l': `${d.left}px`, '--r': `${d.right}px`, '--t': `${d.top}px`, '--b': `${d.bottom}px`, '--nl': `${p.left}px`, '--nr': `${p.right}px`, '--nt': `${p.top}px`, '--nb': `${p.bottom}px` },
  };
}

const waiting = (): MapReveal => 'wait';

export function GasPlaceholder({ view, off }: { view: View; off: boolean }) {
  const reveal = useSyncExternalStore(subscribeMapReveal, getMapReveal, waiting);
  const [gone, setGone] = useState(false);
  // Covered by the drawn nebula, or fading out because none will come: either way it leaves the document once the
  // canvas's fade (or its own) has run.
  const fading = off || reveal === 'sky';
  const leaving = fading || reveal === 'gas';
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setGone(true), MAP_REVEAL_FADE_MS + 80);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  if (gone) return null;
  const { kind, viewBox, image, vars } = placeholderLayout(view);
  return (
    <div className={`gas-ph gas-ph--${kind}${fading ? ' is-leaving' : ''}`} aria-hidden="true" style={vars as CSSProperties}>
      {viewBox ? (
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" focusable="false">
          <image href={GAS_PLACEHOLDER_BALANCED} {...image} preserveAspectRatio="none" />
        </svg>
      ) : null}
    </div>
  );
}
