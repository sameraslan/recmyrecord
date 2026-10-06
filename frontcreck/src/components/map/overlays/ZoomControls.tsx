'use client';

import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import type { MapApi } from '../types';
import { NamesToggle } from './NamesToggle';

export function ZoomControls({ api }: { api: React.RefObject<MapApi | null> }) {
  return (
    <div className="map-zoom">
      {/* First child, so the phone rules that lift or hide the zoom stack (styles/map.css) cover it too. */}
      <NamesToggle />
      <button type="button" aria-label={COPY.map.zoomIn} onClick={() => api.current?.zoomBy(1.6)}>
        <Icon name="plus" />
      </button>
      <button type="button" aria-label={COPY.map.zoomOut} onClick={() => api.current?.zoomBy(1 / 1.6)}>
        <Icon name="minus" />
      </button>
      <button type="button" aria-label={COPY.map.reset} onClick={() => api.current?.reset()}>
        <Icon name="fit" />
      </button>
    </div>
  );
}
