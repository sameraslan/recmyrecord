import { COPY } from '@/lib/copy';
import { isMapZoomed, setOverlayEl } from '../state/overlayEls';

/**
 * The map's one hint line (desktop only, bottom-left), in Explore. Hidden while the card is open and beside an
 * open album, where the approved picture has no line and no band (it stays mounted there, so it fades back in
 * Explore); OverlayDriver also hides it (`data-zoomed`) once the map is zoomed in far enough for covers (mockup
 * `.zoomed .map-hint`).
 */
export function MapHint({ hidden }: { hidden: boolean }) {
  return (
    <p
      className={`map-hint${hidden ? ' is-hidden' : ''}`}
      aria-hidden={hidden || undefined}
      ref={(el) => {
        setOverlayEl('hint', el);
        // Without a camera move no frame is drawn, so start from the last frame's zoom state (no fade-out flash).
        if (el) el.dataset.zoomed = isMapZoomed() ? '1' : '0';
      }}
    >
      {COPY.map.hint}
    </p>
  );
}
