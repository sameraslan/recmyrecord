'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCatalog, usePositions } from '@/lib/data/useData';
import { useIsNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import type { StopId } from '@/lib/types';
import { albumHref, replaceBy, viewFromPathname, type View } from '@/lib/url-state';
import { ErrorPanel } from '@/components/ErrorPanel';
import { buildMapData } from './data';
import { NoWebGL } from './overlays/NoWebGL';
import { SimilaritySlider } from './overlays/SimilaritySlider';
import { ZoomControls } from './overlays/ZoomControls';
import { isWebGLAvailable } from './state/webgl';
import type { MapApi, MapCallbacks, MapInput, MapPadding } from './types';

const MusicMap = dynamic(() => import('./MusicMap'), { ssr: false, loading: () => null });

/** Space kept between framed albums and the top of the phone slider panel. */
const PHONE_SLIDER_MARGIN_PX = 4;
/** CSS px the phone slider panel covers from the bottom of the map before it is first measured, and on phone
 * views without it (its 12 px offset plus its 152.5 px height, without a safe-area inset). */
const PHONE_SLIDER_COVER_FALLBACK_PX = 165;

/** Album framing: clear of the slider panel (top-left on desktop, bottom on phones, where the bottom is measured). */
const DESKTOP_PADDING: MapPadding = { top: 262, right: 96, bottom: 90, left: 96 };
const PHONE_PADDING: MapPadding = { top: 80, right: 60, bottom: PHONE_SLIDER_COVER_FALLBACK_PX + PHONE_SLIDER_MARGIN_PX, left: 60 };
/** Overview framing of the whole cloud (mockup fitTarget); on phones clear of the bottom slider. */
// The mockup's fitTarget fits h - 170 and shifts the cloud up 30 px: top 85 - 30, bottom 85 + 30.
const DESKTOP_FIT_PADDING: MapPadding = { top: 55, right: 40, bottom: 115, left: 40 };
// Phone: clear of the bottom slider panel (bottom measured).
const PHONE_FIT_PADDING: MapPadding = { top: 90, right: 40, bottom: PHONE_SLIDER_COVER_FALLBACK_PX + PHONE_SLIDER_MARGIN_PX, left: 40 };

/**
 * CSS px of the map pane the phone slider panel covers from the bottom (pane bottom minus the panel's top), so the
 * framing, the marker bounds and the zoom controls follow its real height and `env(safe-area-inset-bottom)`.
 * Measured with a ResizeObserver on the panel and the pane plus window resizes (a collapsing Safari toolbar changes
 * the inset without resizing the panel). Changes under 1 px are ignored. null until first measured, and while
 * `active` is false (desktop, or no slider rendered).
 */
function useSliderCover(paneRef: React.RefObject<HTMLDivElement | null>, active: boolean): number | null {
  const [cover, setCover] = useState<number | null>(null);
  useEffect(() => {
    const pane = paneRef.current;
    const panel = active ? pane?.querySelector<HTMLElement>('.mode') : null;
    if (!pane || !panel) {
      setCover(null);
      return;
    }
    const measure = () => {
      const v = Math.max(0, pane.getBoundingClientRect().bottom - panel.getBoundingClientRect().top);
      setCover((prev) => (prev !== null && Math.abs(prev - v) < 1 ? prev : v));
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(panel);
    ro?.observe(pane);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [paneRef, active]);
  return active ? cover : null;
}

/** True after first paint (two animation frames) plus an idle slot: three.js never competes with it. */
function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    let timer = 0;
    let idle = 0;
    const go = () => setReady(true);
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(go, { timeout: 600 });
        else timer = window.setTimeout(go, 50);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      if (timer) window.clearTimeout(timer);
    };
  }, []);
  return ready;
}

/** The one persistent map (mounted in the root layout), plus its overlays. Routes only change its inputs. */
export function MapStage() {
  const pathname = usePathname();
  const view = viewFromPathname(pathname);
  const router = useRouter();
  const narrow = useIsNarrow();
  const painted = useAfterFirstPaint();
  const webgl = useAppStore((s) => s.webgl);
  const stop = useAppStore((s) => s.stop);
  const focus = useAppStore((s) => s.focus);
  const hot = useAppStore((s) => s.hot);
  const selected = useAppStore((s) => s.selected);
  const panelInset = useAppStore((s) => s.panelInset);
  const mapMode = useAppStore((s) => s.mapMode);

  useEffect(() => {
    // After first paint, like the rest of the map: the probe creates (and releases) a WebGL context.
    if (painted) useAppStore.getState().setWebgl(isWebGLAvailable() ? 'ok' : 'unavailable');
  }, [painted]);

  const enabled = painted && webgl === 'ok';
  const { status: catalogStatus, catalog, retry: retryCatalog } = useCatalog(enabled);
  const { status: positionsStatus, positions, retry: retryPositions } = usePositions(enabled);
  const mapData = useMemo(() => (catalog && positions ? buildMapData(catalog.albums, positions) : null), [catalog, positions]);

  const interactive = view === 'explore' || (view === 'album' && (!narrow || mapMode));
  const dimmed = view === 'home' || view === 'about' || view === 'other';
  const paneRef = useRef<HTMLDivElement>(null);
  // The full-width phone slider panel (rendered whenever the phone map is interactive).
  const sliderShown = narrow && interactive;
  const measuredCover = useSliderCover(paneRef, sliderShown);
  const sliderCover = sliderShown ? (measuredCover ?? PHONE_SLIDER_COVER_FALLBACK_PX) : 0;
  const phonePadding = useMemo(() => {
    // Without the slider (Home, the phone album list), phone framing keeps the fallback clearance.
    const bottom = (sliderShown ? sliderCover : PHONE_SLIDER_COVER_FALLBACK_PX) + PHONE_SLIDER_MARGIN_PX;
    return { frame: { ...PHONE_PADDING, bottom }, fit: { ...PHONE_FIT_PADDING, bottom } };
  }, [sliderShown, sliderCover]);
  const input = useMemo<MapInput>(
    () => ({
      stop,
      focus,
      hot,
      selected: view === 'explore' ? selected : null,
      interactive,
      dimmed,
      insetLeft: view === 'album' && !narrow ? panelInset : 0,
      framePadding: narrow ? phonePadding.frame : DESKTOP_PADDING,
      fitPadding: narrow ? phonePadding.fit : DESKTOP_FIT_PADDING,
      // The full-width phone slider panel; the desktop corner card stays out of the marker bounds.
      bottomCover: sliderCover,
    }),
    [stop, focus, hot, selected, view, interactive, dimmed, narrow, panelInset, phonePadding, sliderCover],
  );

  const viewRef = useRef<View>(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const apiRef = useRef<MapApi | null>(null);
  const onApi = useCallback((api: MapApi | null) => {
    apiRef.current = api;
    if (window.__rmr) window.__rmr.map = api;
  }, []);

  // The list and the map react to the store at once; the URL is written a frame later, off the interaction path.
  const onStop = useCallback((s: StopId) => {
    useAppStore.getState().setStop(s);
    if (viewRef.current !== 'album') return;
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (viewRef.current === 'album' && useAppStore.getState().stop === s) replaceBy(s);
      }, 0),
    );
  }, []);

  const callbacks = useMemo<MapCallbacks>(
    () => ({
      onHover: (id) => {
        if (viewRef.current === 'album') useAppStore.getState().setHot(id);
      },
      onPick: (id) => {
        const v = viewRef.current;
        if (v === 'explore') {
          useAppStore.getState().setSelected(id);
          apiRef.current?.flyTo(id);
        } else if (v === 'album' && catalog) {
          const s = useAppStore.getState();
          if (s.focus?.seed !== id) router.push(albumHref(catalog.albums[id].slug, s.stop));
        }
      },
      onEmpty: () => {
        if (viewRef.current === 'explore') useAppStore.getState().setSelected(null);
      },
      onContextLost: () => useAppStore.getState().setWebgl('unavailable'),
    }),
    [catalog, router],
  );

  const failed = catalogStatus === 'error' || positionsStatus === 'error';
  return (
    <div
      ref={paneRef}
      className={`map-pane${dimmed ? ' is-dimmed' : ''}`}
      data-view={view}
      // The phone zoom controls sit above the measured slider panel (styles/map.css).
      style={measuredCover !== null ? ({ '--slider-cover': `${measuredCover}px` } as React.CSSProperties) : undefined}
    >
      <div className="map-host">
        {enabled && mapData ? (
          <MusicMap data={mapData} input={input} callbacks={callbacks} initialCamera={null} onApi={onApi} />
        ) : null}
      </div>
      {webgl === 'unavailable' && view !== 'home' ? <NoWebGL /> : null}
      {failed && view !== 'home' ? (
        <ErrorPanel
          className="map-msg"
          onRetry={() => {
            retryCatalog();
            retryPositions();
          }}
        />
      ) : null}
      {/* Follows the visible map, right of the album panel (mockup body[data-view="album"] .map-ui). */}
      <div className="map-ui" style={{ left: input.insetLeft }}>
        {interactive ? (
          <>
            <SimilaritySlider stop={stop} onChange={onStop} />
            {mapData ? <ZoomControls api={apiRef} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
