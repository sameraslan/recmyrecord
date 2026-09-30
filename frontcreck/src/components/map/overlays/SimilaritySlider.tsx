'use client';

import { useId, useRef } from 'react';
import { COPY } from '@/lib/copy';
import { STOP_IDS, type StopId } from '@/lib/types';

/** Three-stop similarity control (mockup `.mode`): a native range for keyboard and assistive tech,
 * clickable stop names, and one line describing the current stop. */
export function SimilaritySlider({ stop, onChange }: { stop: StopId; onChange: (stop: StopId) => void }) {
  const id = useId();
  const rangeRef = useRef<HTMLInputElement>(null);
  return (
    <div className="mode panel">
      <label className="cap" htmlFor={`${id}-r`}>
        {COPY.slider.label}
      </label>
      <div className="mode-track">
        <i style={{ left: 8 }} />
        <i style={{ left: '50%' }} />
        <i style={{ left: 'calc(100% - 8px)' }} />
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
            aria-pressed={s === stop}
            onClick={() => {
              onChange(s);
              rangeRef.current?.focus({ preventScroll: true });
            }}
          >
            {COPY.slider.stops[s]}
          </button>
        ))}
      </div>
      <p className="mode-note">{COPY.slider.notes[stop]}</p>
    </div>
  );
}
