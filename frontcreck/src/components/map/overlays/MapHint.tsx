import { COPY } from '@/lib/copy';
import { setOverlayEl } from '../state/overlayEls';

/**
 * Explore's one hint line (desktop only, bottom-left). Hidden while the card is open; OverlayDriver also hides it
 * (`data-zoomed`) once the map is zoomed in far enough for covers (mockup `.zoomed .map-hint`).
 */
export function MapHint({ hidden }: { hidden: boolean }) {
  return (
    <p
      className={`map-hint${hidden ? ' is-hidden' : ''}`}
      aria-hidden={hidden || undefined}
      ref={(el) => {
        setOverlayEl('hint', el);
      }}
    >
      {COPY.map.hint}
    </p>
  );
}
