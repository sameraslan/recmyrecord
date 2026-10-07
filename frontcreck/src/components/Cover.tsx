'use client';

import { useState, type CSSProperties } from 'react';
import { withLightnessFloor } from '@/lib/color';
import { coverUrl, isFrameCover, tileLetter } from '@/lib/data/catalog';
import { thumbSheetOf, thumbStyle } from '@/lib/data/sprites';
import { useThumbSheet } from '@/lib/thumb-sheet';
import type { AlbumSummary } from '@/lib/types';

/** Tile background by `cluster % 3`; the one definition, reused by every other tile drawing (Task 11). */
export const TILE: readonly string[] = ['#3b2a22', '#2c3024', '#3b3120'];
/** HSL lightness a page's tile is never darker than: the cluster colours are close to the album header's wash,
 * where a tile at its own colour disappears. The map sprites and the phone strip keep TILE as it is. */
export const TILE_LIGHTNESS_FLOOR = 0.24;
const TILE_SHOWN: readonly string[] = TILE.map((c) => withLightnessFloor(c, TILE_LIGHTNESS_FLOOR));
/** Background of the lettered tile for a cluster. */
export const tileColor = (cluster: number): string => TILE_SHOWN[cluster % 3];
/** A video frame is drawn this much larger inside its square, so the frame's own edges (a sliver of its border
 * at the left and right) fall outside the box. The phone strip's canvas uses the same factor. */
export const FRAME_COVER_ZOOM = 1.06;

export interface CoverProps {
  album: Pick<AlbumSummary, 'id' | 'title' | 'coverId' | 'cluster'>;
  /** CSS px the cover is shown at; picks the remote image size and the tile letter size. */
  size: number;
  className?: string;
  eager?: boolean;
  /** Let CSS set the width (shelf covers); otherwise the width is `size`. */
  fluid?: boolean;
}

/** Remote cover, from Spotify or one of the other hosts of `coverUrlAt` (Deezer, Apple, Bandcamp, a YouTube
 * frame, the Cover Art Archive); on error the 48 px sprite from the album's thumbnail sheet; with no cover id,
 * or when the sprite sheet fails too, a lettered tile. The tile is a failure state only: while the remote image (or the
 * sheet) loads, the box is empty. The sprite element, the only reference to a thumbnail sheet (up to 2.3 MB), is
 * rendered only after the remote image failed and the sheet has loaded, so a normal page load never fetches
 * one. A cover that is a video frame (16:9, without bars: see coverUrlAt) shows its centre square (`.cover img`
 * is `object-fit: cover`), slightly enlarged (`data-frame`, FRAME_COVER_ZOOM in search.css). The tile's letter
 * follows `tileLetter`. */
export function Cover({ album, size, className = '', eager = false, fluid = false }: CoverProps) {
  const url = coverUrl(album.coverId, size);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = url !== null && failedFor === url;
  const sheet = useThumbSheet(failed, thumbSheetOf(album.id));
  const state = url && !failed ? 'remote' : url && sheet !== 'error' ? 'sprite' : 'tile';
  const frame = isFrameCover(album.coverId);
  const style = {
    ...(fluid ? null : { width: size }),
    '--fb': tileColor(album.cluster),
    '--fs': `${Math.round(size * 0.48)}px`,
    ...(frame ? { '--zoom': FRAME_COVER_ZOOM } : null),
  } as CSSProperties;
  return (
    <div className={`cover ${className}`.trim()} style={style} data-state={state} data-frame={frame ? '' : undefined}>
      {state === 'tile' ? (
        <span className="fb" aria-hidden="true">
          {tileLetter(album.title)}
        </span>
      ) : null}
      {state === 'sprite' && sheet === 'ready' ? <span className="spr" style={thumbStyle(album.id)} aria-hidden="true" /> : null}
      {state === 'remote' && url ? (
        // eslint-disable-next-line @next/next/no-img-element -- the cover hosts already serve sized covers (coverUrlAt); proxying 10,000+ covers through next/image adds cost and no benefit
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
