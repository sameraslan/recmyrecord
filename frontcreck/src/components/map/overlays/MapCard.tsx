'use client';

import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { spotifyUrl } from '@/lib/data/catalog';
import { useIsNarrow } from '@/lib/media';
import type { AlbumSummary, StopId } from '@/lib/types';
import { albumHref } from '@/lib/url-state';

/** The album picked in Explore (mockup `.card`; a bottom sheet resting on the slider panel under 900 px). */
export function MapCard({ album, stop, onClose }: { album: AlbumSummary; stop: StopId; onClose: () => void }) {
  const narrow = useIsNarrow();
  const spotify = spotifyUrl(album);
  return (
    <div className="card panel" role="region" aria-label={COPY.titles.album(album.title, album.artist)}>
      <Cover album={album} size={narrow ? 72 : 88} eager />
      <div className="card-text">
        <p className="t">{album.title}</p>
        <p className="a">{album.artist}</p>
        <div className="row">
          <Link className="btn btn-lamp" href={albumHref(album.slug, stop)}>
            {COPY.map.cardPrimary}
          </Link>
          {spotify ? (
            <a className="btn btn-line" href={spotify} target="_blank" rel="noopener noreferrer">
              {COPY.map.cardSpotify}
              <Icon name="ext" />
              <span className="sr-only">{COPY.album.newTab}</span>
            </a>
          ) : null}
        </div>
      </div>
      <button type="button" className="x" aria-label={COPY.map.cardClose} onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  );
}
