'use client';

import { useLayoutEffect } from 'react';
import { Scene } from './canvas/Scene';
import { FocusMarkers } from './overlays/FocusMarkers';
import { HoverLabel } from './overlays/HoverLabel';
import { NamesToggle } from './overlays/NamesToggle';
import { RegionNames } from './overlays/RegionNames';
import { useMapStore } from './state/mapStore';
import { setOverlayEl } from './state/overlayEls';
import { setStageTop } from './state/stageTop';
import type { MusicMapProps } from './types';

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

/** Loaded with next/dynamic (ssr: false) after first paint, so three.js is its own chunk. */
export default function MusicMap({ data, theme, input, callbacks, initialCamera, onApi }: MusicMapProps) {
  useLayoutEffect(() => {
    useMapStore.getState().setData(data);
  }, [data]);
  useLayoutEffect(() => {
    useMapStore.getState().setTheme(theme);
  }, [theme]);
  useLayoutEffect(() => {
    // The region names (and the glints) read the header's height from state/stageTop.ts: the same number as the
    // camera's, set before setInput asks for the frame that places them.
    setStageTop(input.insetTop);
    useMapStore.getState().setInput(input);
  }, [input]);
  useLayoutEffect(() => {
    useMapStore.getState().setCallbacks(callbacks);
  }, [callbacks]);

  return (
    <>
      <Scene initialCamera={initialCamera} onApi={onApi} />
      {/* Under the focus markers, the hover label and the map's controls (z-index 2). */}
      <RegionNames />
      <FocusMarkers albums={data.albums} />
      <HoverLabel albums={data.albums} />
      <SelectedRing />
      <NamesToggle shown={input.interactive} />
    </>
  );
}
