'use client';

import { useId, useRef } from 'react';
import { COPY } from '@/lib/copy';
import { STOP_IDS, type StopId } from '@/lib/types';

/** The stops that have no list for an album without audio (its sonic and balanced rows are empty). */
const NEEDS_AUDIO: readonly StopId[] = ['sonic', 'balanced'];
const TRACK_LEFT = [8, '50%', 'calc(100% - 8px)'] as const;

/** Three-stop similarity control (mockup `.mode`): a native range for keyboard and assistive tech,
 * clickable stop names, and one line describing the current stop.
 * `noAudio` (beside an album without audio): the Sound and Balanced stops and their names are dimmed and say
 * why (the list's own note, as their accessible description and tooltip); they stay operable and keep their names. At
 * those stops the line under them is that note instead of the stop's caption. */
export function SimilaritySlider({ stop, onChange, noAudio = false }: { stop: StopId; onChange: (stop: StopId) => void; noAudio?: boolean }) {
  const id = useId();
  const rangeRef = useRef<HTMLInputElement>(null);
  const off = (s: StopId) => noAudio && NEEDS_AUDIO.includes(s);
  return (
    <div className="mode panel">
      <label className="cap" htmlFor={`${id}-r`}>
        {COPY.slider.label}
      </label>
      <div className="mode-track">
        {STOP_IDS.map((s, n) => (
          <i key={s} className={off(s) ? 'is-off' : undefined} style={{ left: TRACK_LEFT[n] }} />
        ))}
        <input
          ref={rangeRef}
          id={`${id}-r`}
          type="range"
          min={0}
          max={2}
          step={1}
          value={STOP_IDS.indexOf(stop)}
          aria-valuetext={COPY.slider.stops[stop]}
          onChange={(e) => onChange(STOP_IDS[Number(e.target.value)])}
        />
      </div>
      <div className="mode-stops">
        {STOP_IDS.map((s) => (
          <button
            key={s}
            type="button"
            tabIndex={-1}
            className={off(s) ? 'is-off' : undefined}
            aria-pressed={s === stop}
            aria-describedby={off(s) ? `${id}-off` : undefined}
            title={off(s) ? COPY.album.noAudio : undefined}
            onClick={() => {
              onChange(s);
              rangeRef.current?.focus({ preventScroll: true });
            }}
          >
            {COPY.slider.stops[s]}
          </button>
        ))}
      </div>
      {/* The description of the dimmed stops (referenced by id; `hidden` keeps it out of the page's own reading order). */}
      {noAudio ? (
        <span id={`${id}-off`} hidden>
          {COPY.album.noAudio}
        </span>
      ) : null}
      <p className="mode-note">{off(stop) ? COPY.album.noAudio : COPY.slider.notes[stop]}</p>
    </div>
  );
}
