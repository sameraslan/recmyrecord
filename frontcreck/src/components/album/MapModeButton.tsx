import type { Ref } from 'react';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';

/** Phone only (hidden by CSS from 900 px): switches the album view between the list and the full map. */
export function MapModeButton({ on, onToggle, buttonRef }: { on: boolean; onToggle: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={buttonRef} type="button" className={`fab-map${on ? ' fab-map--on' : ''}`} aria-label={on ? COPY.phone.listLabel : COPY.phone.mapLabel} onClick={onToggle}>
      <Icon name={on ? 'list' : 'map'} strokeWidth={1.8} />
      <span aria-hidden="true">{on ? COPY.phone.list : COPY.phone.map}</span>
    </button>
  );
}
