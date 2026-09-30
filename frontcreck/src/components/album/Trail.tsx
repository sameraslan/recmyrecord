'use client';

import Link from 'next/link';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';
import { visibleTrail } from '@/lib/trail';
import type { StopId } from '@/lib/types';
import { albumHref } from '@/lib/url-state';

export function Trail({ current, stop }: { current: string; stop: StopId }) {
  const trail = useAppStore((s) => s.trail);
  if (trail.length < 2) return <div className="trail" aria-hidden="true" />;
  const { items, truncated } = visibleTrail(trail);
  return (
    <nav className="trail" aria-label={COPY.album.trailNav}>
      <span className="cap">{COPY.album.trailLabel}</span>
      <ol>
        {truncated ? <li aria-hidden="true">{COPY.album.trailMore}</li> : null}
        {items.map((t) => (
          <li key={t.slug}>
            {t.slug === current ? <span aria-current="page">{t.title}</span> : <Link href={albumHref(t.slug, stop)}>{t.title}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
