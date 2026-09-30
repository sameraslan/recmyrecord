'use client';

import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { spotifyUrl } from '@/lib/data/catalog';
import { useAppStore } from '@/lib/store';
import type { RecRow as Row, StopId } from '@/lib/types';
import { albumHref } from '@/lib/url-state';

export function RecRow({ row, stop }: { row: Row; stop: StopId }) {
  const hot = useAppStore((s) => s.hot === row.id);
  const setHot = (id: number | null) => useAppStore.getState().setHot(id);
  const spotify = spotifyUrl(row);
  return (
    <li className={`rec${hot ? ' hot' : ''}`} data-flip={row.id} data-album-id={row.id}>
      <Link
        className="rec-main"
        href={albumHref(row.slug, stop)}
        aria-label={COPY.album.rowLabel(row.title, row.artist, row.shared)}
        onMouseEnter={() => setHot(row.id)}
        onFocus={() => setHot(row.id)}
        onBlur={() => setHot(null)}
      >
        <span className="rec-n" aria-hidden="true">
          {row.rank}
        </span>
        <Cover album={row} size={60} />
        <span className="rec-text" aria-hidden="true">
          <span className="rec-title">{row.title}</span>
          <span className="rec-artist">{row.artist}</span>
          {row.shared.length ? (
            // The mockup sets the words in a lighter colour than "Shares".
            <span className="rec-shared">
              {COPY.album.shares([])}
              <span>{row.shared.join(', ')}</span>
            </span>
          ) : null}
        </span>
      </Link>
      {spotify ? (
        <a className="rec-sp" href={spotify} target="_blank" rel="noopener noreferrer" aria-label={COPY.album.rowSpotify(row.title)} title={COPY.album.openInSpotify}>
          <Icon name="ext" />
        </a>
      ) : null}
    </li>
  );
}
