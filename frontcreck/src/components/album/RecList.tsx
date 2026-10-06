'use client';

import { useId, useRef } from 'react';
import { COPY } from '@/lib/copy';
import { REC_DEFAULT_VISIBLE } from '@/lib/data/catalog';
import { useAppStore } from '@/lib/store';
import type { AlbumId, RecRow as Row, StopId } from '@/lib/types';
import { showStop } from '@/lib/show-stop';
import { RecRow } from './RecRow';
import { useFlipList } from './useFlipList';

/**
 * `note`: shown in place of an empty list (an album without audio at the sonic and balanced stops), with a
 * control that moves the slider to Mood. The note's sentence is a polite status region that is in the page
 * before the note is (a region added together with its text is not announced), so arriving at the note with the
 * slider is read out; the control stays outside it, so it is not read out as part of the sentence.
 */
export function RecList({ seedId, rows, total, stop, expanded, onToggle, note = false }: { seedId: AlbumId; rows: Row[]; total: number; stop: StopId; expanded: boolean; onToggle: () => void; note?: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const listId = useId();
  useFlipList(listRef, seedId, `${stop}|${expanded}`);
  const showMood = () => {
    showStop('mood');
    // The control is removed with the note, which would leave focus on <body>: the heading of the list that
    // replaces the note takes it (the heading stays where it is, so nothing scrolls).
    headingRef.current?.focus({ preventScroll: true });
  };
  return (
    <section className="recs" aria-labelledby="recs-h">
      <h2 className="recs-h" id="recs-h" tabIndex={-1} ref={headingRef}>
        {COPY.album.listHeading}
      </h2>
      <div className={note ? 'recs-note' : undefined}>
        <p role="status">{note ? COPY.album.noAudio : null}</p>
        {note ? (
          <button type="button" className="textbtn u" onClick={showMood}>
            <span>{COPY.album.noAudioAction}</span>
          </button>
        ) : null}
      </div>
      {note ? null : (
        <ol className="rec-list" id={listId} ref={listRef} onMouseLeave={() => useAppStore.getState().setHot(null)}>
          {rows.map((r) => (
            <RecRow key={r.id} row={r} stop={stop} />
          ))}
        </ol>
      )}
      {total > REC_DEFAULT_VISIBLE ? (
        <button type="button" className="show-more textbtn u" aria-expanded={expanded} aria-controls={listId} onClick={onToggle}>
          <span>{expanded ? COPY.album.showFewer : COPY.album.showMore}</span>
        </button>
      ) : null}
    </section>
  );
}
