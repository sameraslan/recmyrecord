'use client';

import { useLayoutEffect } from 'react';
import { Cover } from '@/components/Cover';
import { toSummary } from '@/lib/data/catalog';
import type { AlbumRecord } from '@/lib/types';
import { requestRender } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, setOverlayEl, setOverlaySize } from '../state/overlayEls';

/** Title and artist of the album under the pointer (mockup `.map-tip`); positioned by OverlayDriver. */
export function HoverLabel({ albums }: { albums: AlbumRecord[] }) {
  const hovered = useMapStore((s) => s.hoveredIndex);
  useLayoutEffect(() => {
    // Measure once per content change; OverlayDriver places the label every frame from this size.
    const el = getOverlayEl('hover');
    setOverlaySize('hover', el?.offsetWidth ?? 0, el?.offsetHeight ?? 0);
    requestRender();
  }, [hovered]);
  useLayoutEffect(() => {
    // Late size changes (a web font arriving) are picked up without a layout read per frame.
    const el = getOverlayEl('hover');
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setOverlaySize('hover', el.offsetWidth, el.offsetHeight);
      requestRender();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const a = hovered !== null && albums[hovered] ? toSummary(albums, hovered) : null;
  return (
    <div className="map-tip" aria-hidden="true" ref={(el) => { setOverlayEl('hover', el); }}>
      {a ? (
        <>
          <Cover album={a} size={40} />
          <div className="map-tip-text">
            <div className="t">{a.title}</div>
            <div className="a">{a.artist}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
