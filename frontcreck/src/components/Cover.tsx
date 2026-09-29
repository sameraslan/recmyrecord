'use client';

import { useState, type CSSProperties } from 'react';
import { coverUrl, initialLetter } from '@/lib/data/catalog';
import { thumbStyle } from '@/lib/data/sprites';
import type { AlbumSummary } from '@/lib/types';

/** Tile background by `cluster % 3`; the one definition, reused by every other tile drawing (Task 11). */
export const TILE: readonly string[] = ['#3b2a22', '#2c3024', '#3b3120'];

export interface CoverProps {
  album: Pick<AlbumSummary, 'id' | 'title' | 'coverId' | 'cluster'>;
  /** CSS px the cover is shown at; picks the remote image size and the tile letter size. */
  size: number;
  className?: string;
  eager?: boolean;
  /** Let CSS set the width (shelf covers); otherwise the width is `size`. */
  fluid?: boolean;
}

/** Remote cover; on error the 48 px sprite from thumbs.webp; with no cover id (or under both) a lettered tile.
 * The lettered tile is also the loading placeholder: the sprite element, the only reference to the 2.3 MB
 * thumbs.webp, is rendered only after the remote image failed, so a normal page load never fetches the sheet. */
export function Cover({ album, size, className = '', eager = false, fluid = false }: CoverProps) {
  const url = coverUrl(album.coverId, size);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = url !== null && failedFor === url;
  const state = url && !failed ? 'remote' : album.coverId ? 'sprite' : 'tile';
  const style = {
    ...(fluid ? null : { width: size }),
    '--fb': TILE[album.cluster % 3],
    '--fs': `${Math.round(size * 0.48)}px`,
  } as CSSProperties;
  return (
    <div className={`cover ${className}`.trim()} style={style} data-state={state}>
      <span className="fb" aria-hidden="true">
        {initialLetter(album.title)}
      </span>
      {state === 'sprite' ? <span className="spr" style={thumbStyle(album.id)} aria-hidden="true" /> : null}
      {state === 'remote' && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- the Spotify CDN already serves sized covers; proxying 4,000+ covers through next/image adds cost and no benefit
        <img
          ref={(el) => {
            if (!el || !el.complete || loadedFor === url || failedFor === url) return;
            if (el.naturalWidth > 0) setLoadedFor(url);
            else setFailedFor(url);
          }}
          src={url}
          alt=""
          width={size}
          height={size}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={loadedFor === url ? 'ok' : undefined}
          onLoad={() => setLoadedFor(url)}
          onError={() => setFailedFor(url)}
        />
      ) : null}
    </div>
  );
}
