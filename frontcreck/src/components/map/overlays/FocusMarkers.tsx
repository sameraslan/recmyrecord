'use client';

import { useEffect, useRef } from 'react';
import { Cover } from '@/components/Cover';
import { toSummary } from '@/lib/data/catalog';
import type { AlbumRecord } from '@/lib/types';
import { MARKER_SIZE } from '../state/focusLayout';
import { requestRender } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { markerKey, setOverlayEl } from '../state/overlayEls';

/** Seed and recommendation covers with rank badges, and the lines between them. Positioned by MarkerDriver.
 * Hidden from assistive technology: the album list is the keyboard and screen reader route. */
export function FocusMarkers({ albums }: { albums: AlbumRecord[] }) {
  const focus = useMapStore((s) => s.input.focus);
  const hot = useMapStore((s) => s.input.hot);
  const hovered = useMapStore((s) => s.hoveredIndex);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestRender();
  }, [focus, hot, hovered]);

  // The covers sit over the canvas, so a wheel over one would otherwise not zoom the map: hand it on.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const onWheel = (e: WheelEvent) => {
      const canvas = layer.parentElement?.querySelector('canvas');
      if (!canvas) return;
      e.preventDefault();
      canvas.dispatchEvent(new WheelEvent('wheel', e));
    };
    layer.addEventListener('wheel', onWheel, { passive: false });
    return () => layer.removeEventListener('wheel', onWheel);
  }, [focus]);

  if (!focus) return null;
  const ids = [focus.seed, ...focus.recs];
  const isHot = (id: number) => id !== focus.seed && (hot === id || hovered === id);
  const enter = (id: number) => {
    const s = useMapStore.getState();
    s.setHoveredIndex(id);
    s.callbacks.onHover(id);
  };
  const leave = () => {
    const s = useMapStore.getState();
    s.setHoveredIndex(null);
    s.callbacks.onHover(null);
  };

  return (
    <div className="mk-layer" aria-hidden="true" ref={layerRef}>
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
          ref={(el) => { setOverlayEl(markerKey(id), el); }}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'touch') enter(id);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'touch') leave();
          }}
          onClick={() => {
            leave(); // the marker is about to move or unmount under a resting pointer, so pointerleave may never fire
            useMapStore.getState().callbacks.onPick(id);
          }}
        >
          <Cover album={toSummary(albums, id)} size={n === 0 ? MARKER_SIZE.seed : MARKER_SIZE.rec} eager />
          {n > 0 ? <span className="mk-n">{n}</span> : null}
        </div>
      ))}
    </div>
  );
}
