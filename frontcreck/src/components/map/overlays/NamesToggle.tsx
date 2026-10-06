'use client';

import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { useAppStore } from '@/lib/store';

/** Region names on or off: a separate box 8 px above the zoom stack (the owner's option B, approved
 * 2026-10-04, as the Trifid prototype's namesToggle builds it). Icon only; the choice is remembered on this
 * device (lib/namesPref.ts). One fixed accessible label with a pressed state; the label never swaps.
 * PENDING OWNER APPROVAL: the label's wording (COPY.map.names). */
export function NamesToggle() {
  const on = useAppStore((s) => s.namesOn);
  return (
    <button type="button" className="map-names" aria-pressed={on} aria-label={COPY.map.names} onClick={() => useAppStore.getState().setNamesOn(!on)}>
      <Icon name={on ? 'names' : 'namesOff'} strokeWidth={1.6} />
    </button>
  );
}
