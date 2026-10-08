'use client';

import { useLayoutEffect } from 'react';
import { markOnce } from '@/lib/marks';
import { Scene } from './canvas/Scene';
import { FocusMarkers } from './overlays/FocusMarkers';
import { HoverLabel } from './overlays/HoverLabel';
import { TwinkleLayer } from './overlays/Twinkle';
import { useMapStore } from './state/mapStore';
import { setOverlayEl } from './state/overlayEls';
import { setStageTop } from './state/stageTop';
import type { MusicMapProps } from './types';

// The map's code has run (lib/marks.ts).
markOnce('rmr-chunk-end');

/** Off-white ring (the lamp token) on a dark casing around the album selected in Explore; positioned by OverlayDriver. */
function SelectedRing() {
  return (
    <div
      className="map-sel"
      aria-hidden="true"
      ref={(el) => {
        setOverlayEl('selected', el);
      }}
    />
  );
}

/** Imported by boot.ts loadMapChunk right after first paint and never by the page itself, so three.js is its own chunk. */
export default function MusicMap({ data, theme, input, callbacks, initialCamera, onApi }: MusicMapProps) {
  useLayoutEffect(() => {
    useMapStore.getState().setData(data);
  }, [data]);
  useLayoutEffect(() => {
    useMapStore.getState().setTheme(theme);
  }, [theme]);
  useLayoutEffect(() => {
    // The glints read the header's height from state/stageTop.ts: the same number as the camera's, set before
    // setInput asks for the frame that places them.
    setStageTop(input.insetTop);
    useMapStore.getState().setInput(input);
  }, [input]);
  useLayoutEffect(() => {
    useMapStore.getState().setCallbacks(callbacks);
  }, [callbacks]);

  return (
    <>
      <Scene initialCamera={initialCamera} onApi={onApi} />
      {/* Star glints: over the canvas (z-index 1), under the focus markers, the hover label and the map's controls. */}
      <TwinkleLayer />
      <FocusMarkers albums={data.albums} />
      <HoverLabel albums={data.albums} />
      <SelectedRing />
    </>
  );
}
