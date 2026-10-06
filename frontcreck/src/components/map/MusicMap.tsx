'use client';

import { useLayoutEffect } from 'react';
import { Scene } from './canvas/Scene';
import { FocusMarkers } from './overlays/FocusMarkers';
import { HoverLabel } from './overlays/HoverLabel';
import { NamesToggle } from './overlays/NamesToggle';
import { useMapStore } from './state/mapStore';
import { setOverlayEl } from './state/overlayEls';
import type { MusicMapProps } from './types';

/** Amber ring around the album selected in Explore; positioned by OverlayDriver. */
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
    useMapStore.getState().setInput(input);
  }, [input]);
  useLayoutEffect(() => {
    useMapStore.getState().setCallbacks(callbacks);
  }, [callbacks]);

  return (
    <>
      <Scene initialCamera={initialCamera} onApi={onApi} />
      <FocusMarkers albums={data.albums} />
      <HoverLabel albums={data.albums} />
      <SelectedRing />
      <NamesToggle shown={input.interactive} />
    </>
  );
}
