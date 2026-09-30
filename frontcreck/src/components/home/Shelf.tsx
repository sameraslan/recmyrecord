'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Cover } from '@/components/Cover';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import type { AlbumSummary } from '@/lib/types';
import { albumHref } from '@/lib/url-state';

/** Covers to start from; hovering or focusing one names it in the line above (mockup Home B). */
export function Shelf({ albums }: { albums: AlbumSummary[] }) {
  const stop = useAppStore((s) => s.stop);
  const [shown, setShown] = useState<AlbumSummary | null>(null);
  return (
    <div className="shelf">
      <p className="shelf-now" aria-hidden="true">
        {shown ? (
          <>
            <span className="t">{shown.title}</span>
            <span className="a">{shown.artist}</span>
          </>
        ) : (
          <span className="cap">{COPY.home.shelfLabel}</span>
        )}
      </p>
      <ul
        className="mosaic"
        aria-label={COPY.home.shelfListLabel}
        onMouseLeave={() => setShown(null)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShown(null);
        }}
      >
        {albums.map((a) => (
          <li key={a.id}>
            <Link
              href={albumHref(a.slug, stop)}
              aria-label={COPY.home.albumLabel(a.title, a.artist)}
              onMouseEnter={() => setShown(a)}
              onFocus={() => setShown(a)}
            >
              <Cover album={a} size={110} fluid />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
