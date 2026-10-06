'use client';

import { useId, useRef } from 'react';
import { COPY } from '@/lib/copy';
import { REC_DEFAULT_VISIBLE } from '@/lib/data/catalog';
import { useAppStore } from '@/lib/store';
import type { AlbumId, RecRow as Row, StopId } from '@/lib/types';
import { showStop } from '@/lib/show-stop';
import { RecRow } from './RecRow';
import { useFlipList } from './useFlipList';

/** `note`: shown in place of an empty list (an album without audio at the sonic and balanced stops), with a
 * control that moves the slider to Mood. */
export function RecList({ seedId, rows, total, stop, expanded, onToggle, note = false }: { seedId: AlbumId; rows: Row[]; total: number; stop: StopId; expanded: boolean; onToggle: () => void; note?: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  const listId = useId();
  useFlipList(listRef, seedId, `${stop}|${expanded}`);
  return (
    <section className="recs" aria-labelledby="recs-h">
      <h2 className="recs-h" id="recs-h" tabIndex={-1}>
        {COPY.album.listHeading}
      </h2>
      {note ? (
        <div className="recs-note">
          <p>{COPY.album.noAudio}</p>
          <button type="button" className="textbtn u" onClick={() => showStop('mood')}>
            <span>{COPY.album.noAudioAction}</span>
          </button>
        </div>
      ) : null}
      <ol className="rec-list" id={listId} ref={listRef} onMouseLeave={() => useAppStore.getState().setHot(null)}>
        {rows.map((r) => (
          <RecRow key={r.id} row={r} stop={stop} />
        ))}
      </ol>
      {total > REC_DEFAULT_VISIBLE ? (
        <button type="button" className="show-more textbtn u" aria-expanded={expanded} aria-controls={listId} onClick={onToggle}>
          <span>{expanded ? COPY.album.showFewer : COPY.album.showMore}</span>
        </button>
      ) : null}
    </section>
  );
}
