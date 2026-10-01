import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';

/** Beside an album (and in phone map mode): drops the album for Explore with the map left where it is, so the
 * albums around it can be browsed. Top right of the visible map on desktop, top left opposite List on phones. */
export function ExploreHere({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="map-explore panel" onClick={onClick}>
      <Icon name="compass" strokeWidth={1.6} />
      <span>{COPY.map.exploreHere}</span>
    </button>
  );
}
