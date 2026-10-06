'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { STOP_IDS } from '@/lib/types';
import { requestRender } from '../state/invalidate';
import { useMapStore } from '../state/mapStore';
import { clearNameWidths, placeNamesNow, setNameFontFamily } from '../state/nameWidths';
import { nameKey } from '../state/namesLayout';
import { setOverlayEl } from '../state/overlayEls';

/** The driver places the names now. Only before it has mounted is a map frame asked for (it places on it). */
function place(): void {
  if (!placeNamesNow()) requestRender();
}

/** The region names: plain lettering over the map, placed by RegionNamesDriver. Nothing to hover, focus or
 * click, no explanation, hidden from assistive technology, and no pointer events (styles/map.css). One element
 * per label of every stop, each hidden (`off`) until the driver shows it. Renders nothing without theme data
 * or while the names are switched off. */
export function RegionNames() {
  const theme = useMapStore((s) => s.theme);
  const namesOn = useAppStore((s) => s.namesOn);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const shown = !!theme && namesOn;

  useEffect(() => {
    const layer = layerRef.current;
    // Switched off: the layer is gone with its names, and the canvas has nothing to redraw.
    if (!shown || !layer) return;
    const family = getComputedStyle(layer).fontFamily;
    setNameFontFamily(family);
    // Mounted or relabelled: every name is hidden until the driver has placed it.
    place();
    const fonts = document.fonts;
    if (!fonts) return;
    // Widths measured before the face arrived are the fallback's: measure again and place again. Only when the
    // names' own face arrived: another font finishing late must not move them.
    const again = (e: Event) => {
      const faces = (e as FontFaceSetLoadEvent).fontfaces;
      if (faces && !faces.some((f) => family.includes(f.family.replace(/["']/g, '')))) return;
      clearNameWidths();
      place();
    };
    fonts.addEventListener('loadingdone', again);
    return () => fonts.removeEventListener('loadingdone', again);
  }, [shown, theme]);

  if (!theme || !namesOn) return null;
  return (
    <div
      className="rn-layer"
      aria-hidden="true"
      ref={(el) => {
        layerRef.current = el;
        setOverlayEl('names', el);
      }}
    >
      {STOP_IDS.flatMap((stop) =>
        theme.labels[stop].map((label) => (
          <div
            key={nameKey(stop, label.id)}
            className={`rn off${label.strong ? '' : ' fair'}`}
            data-stop={stop}
            style={{ '--lc': `rgb(${label.rgb.join(',')})` } as React.CSSProperties}
            ref={(el) => {
              setOverlayEl(nameKey(stop, label.id), el);
            }}
          >
            <b>{label.name}</b>
          </div>
        )),
      )}
    </div>
  );
}
