'use client';

import { useRef } from 'react';
import { COPY } from '@/lib/copy';
import { usePanelInset } from './usePanelInset';

/**
 * The album panel while an album's data is on its way (mockup skeletonHTML), for `app/album/[slug]/loading.tsx`.
 * Not mounted by a route: album pages are fully static, so a production build never shows a loading boundary
 * there (the whole page arrives at once, prefetched or not), and the boundary made the panel hydrate up to a
 * second after the load event, when Escape and the map focus did not work yet.
 */
export function AlbumSkeleton() {
  const ref = useRef<HTMLElement>(null);
  usePanelInset(ref);
  return (
    <section className="album" ref={ref} aria-busy="true" aria-label={COPY.album.loading}>
      <div className="album-scroll">
        <div className="trail" aria-hidden="true" />
        <div className="seed" aria-hidden="true">
          <div className="cover sk sk-pulse" style={{ width: 116 }} />
          <div className="sk sk-pulse" style={{ gridArea: 'artist', width: 110, height: 15, marginBottom: 8 }} />
          <div className="sk sk-pulse" style={{ gridArea: 'title', width: '78%', height: 42 }} />
          <div className="seed-actions">
            <div className="sk sk-pulse" style={{ width: 170, height: 40 }} />
            <div className="sk sk-pulse" style={{ width: 40, height: 40 }} />
          </div>
          <ul className="tags">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="sk sk-pulse" style={{ width: 74, height: 25, border: 0 }} />
            ))}
          </ul>
        </div>
        <div className="recs" aria-hidden="true">
          <div className="recs-h">{COPY.album.listHeading}</div>
          <ol className="rec-list">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="rec">
                <div className="rec-main">
                  <span className="rec-n" />
                  <div className="cover sk sk-pulse" style={{ width: 60 }} />
                  <span className="rec-text">
                    <span className="sk sk-pulse" style={{ height: 20, width: '60%', margin: '2px 0 6px' }} />
                    <span className="sk sk-pulse" style={{ height: 12, width: '38%', marginBottom: 6 }} />
                    <span className="sk sk-pulse" style={{ height: 11, width: '66%' }} />
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="sr-only" role="status">
          {COPY.album.loading}
        </p>
      </div>
    </section>
  );
}
