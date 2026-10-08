'use client';

import { useEffect, useLayoutEffect } from 'react';
import { BracketText } from '@/components/BracketText';
import { Cover } from '@/components/Cover';
import { toSummary } from '@/lib/data/catalog';
import type { AlbumRecord } from '@/lib/types';
import { requestRender } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { getOverlayEl, setOverlayEl, setOverlaySize } from '../state/overlayEls';

/** An idle period at least this long means no frame is being drawn (one frame is 16.7 ms at 60 Hz). */
export const WARM_MIN_IDLE_MS = 20;

/**
 * Has the browser fetch its fallback fonts for Japanese, Chinese and Korean before a label needs them. The first
 * such text a page lays out costs about 10 ms a line (35 to 60 ms for the label on a busy laptop on battery), and
 * that used to land on the frame in which the first such label showed, often in the middle of a zoom. Here it is
 * paid a line at a time, in idle moments with no frame being drawn: a hidden label beside the real one, laid out
 * once and removed. Returns what cancels it. Without idle callbacks (Safari) nothing is warmed.
 */
export function warmLabelFonts(tip: HTMLElement): () => void {
  if (typeof window.requestIdleCallback !== 'function') return () => {};
  const lines = ['t', 'a'];
  let handle = 0;
  const step = (idle: IdleDeadline) => {
    if (idle.timeRemaining() >= WARM_MIN_IDLE_MS) {
      const el = document.createElement('div');
      el.className = 'map-tip';
      el.style.visibility = 'hidden';
      const line = el.appendChild(document.createElement('div'));
      line.className = lines.shift()!;
      line.textContent = 'あ漢한';
      tip.after(el);
      void el.offsetWidth;
      el.remove();
    }
    handle = lines.length ? window.requestIdleCallback(step) : 0;
  };
  handle = window.requestIdleCallback(step);
  return () => window.cancelIdleCallback(handle);
}

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
  useEffect(() => {
    const el = getOverlayEl('hover');
    return el ? warmLabelFonts(el) : undefined;
  }, []);
  const a = hovered !== null && albums[hovered] ? toSummary(albums, hovered) : null;
  return (
    <div className="map-tip" aria-hidden="true" ref={(el) => { setOverlayEl('hover', el); }}>
      {a ? (
        <>
          <Cover album={a} size={40} />
          <div className="map-tip-text">
            <div className="t">
              <BracketText text={a.title} />
            </div>
            <div className="a">
              <BracketText text={a.artist} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
