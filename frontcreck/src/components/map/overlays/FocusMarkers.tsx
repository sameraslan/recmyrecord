'use client';

import { useEffect } from 'react';
import { Cover } from '@/components/Cover';
import { toSummary } from '@/lib/data/catalog';
import type { AlbumRecord } from '@/lib/types';
import { MARKER_SIZE } from '../state/focusLayout';
import { requestRender } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { badgeKey, markerKey, setOverlayEl } from '../state/overlayEls';

const HIDDEN = { visibility: 'hidden' } as const;

/** Seed and recommendation covers, the lines between them and the rank badges (in their own layer above every
 * cover, as the mockup draws them last). Positioned by MarkerDriver. They take no pointer events: the canvas
 * hit-tests the placed boxes (CursorTracker, PickController), so a drag or pinch that starts on a cover pans or
 * zooms the map. Hidden from assistive technology and never focusable: the album list is the keyboard and
 * screen reader route to the same albums. */
export function FocusMarkers({ albums }: { albums: AlbumRecord[] }) {
  const focus = useMapStore((s) => s.input.focus);
  const hot = useMapStore((s) => s.input.hot);
  const hovered = useMapStore((s) => s.hoveredIndex);

  useEffect(() => {
    requestRender();
  }, [focus, hot, hovered]);

  if (!focus) return null;
  const ids = [focus.seed, ...focus.recs];
  const isHot = (id: number) => id !== focus.seed && (hot === id || hovered === id);

  return (
    <div className="mk-layer" aria-hidden="true">
      <svg className="mk-lines" ref={(el) => { setOverlayEl('lines', el); }}>
        {focus.recs.map((id) => (
          <line key={`to-${id}`} data-to={id} data-hot={isHot(id) ? 'true' : undefined} />
        ))}
        {ids.map((id) => (
          <line key={`leader-${id}`} data-leader={id} style={{ display: 'none' }} />
        ))}
      </svg>
      {ids.map((id, n) => (
        <div
          key={id}
          className={`mk ${n === 0 ? 'mk--seed' : 'mk--rec'}`}
          data-album-id={id}
          data-hot={isHot(id) ? 'true' : undefined}
          // Hidden until MarkerDriver has placed it (React never rewrites an unchanged style prop).
          style={HIDDEN}
          ref={(el) => { setOverlayEl(markerKey(id), el); }}
        >
          <Cover album={toSummary(albums, id)} size={n === 0 ? MARKER_SIZE.seed : MARKER_SIZE.rec} eager />
        </div>
      ))}
      <div className="mk-badges">
        {focus.recs.map((id, n) => (
          <span
            key={id}
            className="mk-n"
            data-for={id}
            data-hot={isHot(id) ? 'true' : undefined}
            style={HIDDEN}
            ref={(el) => { setOverlayEl(badgeKey(id), el); }}
          >
            {n + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
