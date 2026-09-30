'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toSummary } from '@/lib/data/catalog';
import { useCatalog, usePositions } from '@/lib/data/useData';
import { useIsNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import type { StopId } from '@/lib/types';
import { albumHref, replaceBy, viewFromPathname, type View } from '@/lib/url-state';
import { AmbientLayers } from '@/components/album/AmbientWash';
import { ErrorPanel } from '@/components/ErrorPanel';
import { buildMapData } from './data';
import { MapCard } from './overlays/MapCard';
import { MapHint } from './overlays/MapHint';
import { NoWebGL } from './overlays/NoWebGL';
import { SimilaritySlider } from './overlays/SimilaritySlider';
import { ZoomControls } from './overlays/ZoomControls';
import { isWebGLAvailable, warmUpWebGL } from './state/webgl';
import type { MapApi, MapCallbacks, MapInput, MapPadding } from './types';

const MusicMap = dynamic(() => import('./MusicMap'), { ssr: false, loading: () => null });

/** Space kept between framed albums and the top of the phone slider panel. */
const PHONE_SLIDER_MARGIN_PX = 4;
/** CSS px the phone slider panel covers from the bottom of the map before it is first measured, and on phone
 * views without it (its 12 px offset plus its 152.5 px height, without a safe-area inset). */
const PHONE_SLIDER_COVER_FALLBACK_PX = 165;

/** Space kept between a flown-to album and the top of the phone card (bottom sheet). */
const PHONE_CARD_MARGIN_PX = 16;

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

/**
 * CSS px of the map pane the phone Explore card covers from the bottom (pane bottom minus the card's top, so the
 * slider panel under it is included), for the album it shows. Measured synchronously when the card mounts (before
 * the fly to the album starts) and again when it resizes (a web font, a longer title). null without a card, and
 * on desktop, where the card sits in the corner away from the centred album.
 */
function useCardCover(
  paneRef: React.RefObject<HTMLDivElement | null>,
  id: number | null,
  active: boolean,
): { id: number; px: number } | null {
  const [cover, setCover] = useState<{ id: number; px: number } | null>(null);
  useLayoutEffect(() => {
    const pane = paneRef.current;
    const card = active && id !== null ? pane?.querySelector<HTMLElement>('.card') : null;
    if (!pane || !card || id === null) {
      setCover(null);
      return;
    }
    const measure = () => {
      const px = Math.max(0, pane.getBoundingClientRect().bottom - card.getBoundingClientRect().top);
      setCover((prev) => (prev !== null && prev.id === id && Math.abs(prev.px - px) < 1 ? prev : { id, px }));
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(card);
    return () => ro?.disconnect();
  }, [paneRef, id, active]);
  return active && id !== null && cover?.id === id ? cover : null;
}

/** Moves focus off a control that is about to unmount with the card (its close button, its links) to the map. */
function keepFocusOnMap(pane: HTMLElement | null): void {
  if (document.activeElement?.closest('.card')) pane?.querySelector<HTMLElement>('canvas.map-canvas')?.focus({ preventScroll: true });
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
  const mapModeFor = useAppStore((s) => s.mapModeFor);
  // Phone map mode belongs to one album: on a pick the new URL turns it off before the old panel unmounts.
  const mapMode = mapModeFor !== null && pathname === `/album/${mapModeFor}`;
  const ambient = useAppStore((s) => s.ambient);

  useEffect(() => {
    // After first paint, like the rest of the map: the probe creates (and releases) a WebGL context. A worker
    // starts the GPU backend first, so neither the probe nor the renderer blocks the main thread on it.
    if (!painted) return;
    let live = true;
    void warmUpWebGL().then(() => {
      if (live) useAppStore.getState().setWebgl(isWebGLAvailable() ? 'ok' : 'unavailable');
    });
    return () => {
      live = false;
    };
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
  const cardShown = view === 'explore' && selected !== null;
  const cardCover = useCardCover(paneRef, cardShown ? selected : null, narrow);
  const phonePadding = useMemo(() => {
    // Without the slider (Home, the phone album list), phone framing keeps the fallback clearance.
    const bottom = (sliderShown ? sliderCover : PHONE_SLIDER_COVER_FALLBACK_PX) + PHONE_SLIDER_MARGIN_PX;
    // The Explore card (a bottom sheet above the slider): a flown-to album stays above it.
    const frameBottom = cardCover ? Math.max(bottom, cardCover.px + PHONE_CARD_MARGIN_PX) : bottom;
    return { frame: { ...PHONE_PADDING, bottom: frameBottom }, fit: { ...PHONE_FIT_PADDING, bottom } };
  }, [sliderShown, sliderCover, cardCover]);
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

  // Explore camera memory (mockup render: exploreCam). Leaving Explore saves the camera and drops the card;
  // coming back from an album (its close control, Escape or the header nav) restores it, or frames the whole map.
  const prevView = useRef<View>(view);
  const pendingReturn = useRef(false);
  // A layout effect, declared before the one below, so both see the same commit.
  useLayoutEffect(() => {
    const prev = prevView.current;
    prevView.current = view;
    if (prev === view) return;
    const s = useAppStore.getState();
    if (prev === 'explore') {
      if (apiRef.current) s.saveExploreCamera(apiRef.current.getCamera());
      s.setSelected(null);
    }
    pendingReturn.current = view === 'explore' && prev === 'album';
  }, [view]);
  // The pathname can change a commit before the album panel unmounts and clears the focus, so the camera moves
  // only once the map input has no focus (MusicMap applies the input in its layout effect, before this one);
  // otherwise Reset would frame the album just left and the album framing could follow the restore.
  useLayoutEffect(() => {
    if (!pendingReturn.current || view !== 'explore' || input.focus !== null || !apiRef.current) return;
    pendingReturn.current = false;
    const saved = useAppStore.getState().exploreCamera;
    if (saved) apiRef.current.setCamera(saved, true);
    else apiRef.current.reset();
  }, [view, input]);

  // Escape closes the card (mockup keydown order: after the About layer and the album view, both other routes).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || viewRef.current !== 'explore') return;
      if (useAppStore.getState().selected === null) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('textarea, select, [contenteditable="true"]')) return;
      if (t instanceof HTMLInputElement && t.type !== 'range') return;
      // Dialogs (the phone search sheet) and the search popover handle their own Escape.
      if (t?.closest('[aria-modal="true"], .combo')) return;
      keepFocusOnMap(paneRef.current);
      useAppStore.getState().setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // A pick flies to the album once the map input carries the card's height (phones: the sheet's measured
  // cover), so the album lands above the sheet. MusicMap applies the input in its own layout effect, which runs
  // before this one in the same commit.
  const pendingFly = useRef<number | null>(null);
  useLayoutEffect(() => {
    const id = pendingFly.current;
    if (id === null) return;
    if (view !== 'explore' || selected !== id) {
      pendingFly.current = null;
      return;
    }
    if (narrow && cardCover?.id !== id) return; // the sheet is measured in this commit; the next one flies
    pendingFly.current = null;
    apiRef.current?.flyTo(id);
  }, [input, view, selected, narrow, cardCover]);

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
          const s = useAppStore.getState();
          if (s.selected === id) apiRef.current?.flyTo(id);
          else {
            pendingFly.current = id;
            s.setSelected(id);
          }
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
      data-mapmode={view === 'album' && narrow && mapMode ? 'true' : 'false'}
      // The phone zoom controls sit above the measured slider panel (styles/map.css).
      style={measuredCover !== null ? ({ '--slider-cover': `${measuredCover}px` } as React.CSSProperties) : undefined}
    >
      {/* Under the transparent canvas: the album's ambient wash shows beneath the dots. */}
      <AmbientLayers ambient={view === 'album' ? ambient : null} variant="map" />
      <div className="map-host">
        {enabled && mapData ? (
          <MusicMap data={mapData} input={input} callbacks={callbacks} initialCamera={null} onApi={onApi} />
        ) : null}
      </div>
      {/* Home (mockup .veil): dims the map further round the hero; a click on empty map area opens the map. Always
       * mounted so it fades in and out with the dots' own easing (AlbumField) instead of switching. */}
      <div className={`veil${view === 'home' ? '' : ' veil--off'}`} aria-hidden="true" onClick={view === 'home' ? () => router.push('/map') : undefined} />
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
      <div className={`map-ui${cardShown ? ' has-card' : ''}`} style={{ left: input.insetLeft }}>
        {interactive ? (
          <>
            <SimilaritySlider stop={stop} onChange={onStop} />
            {mapData ? <ZoomControls api={apiRef} /> : null}
            {view === 'explore' || view === 'album' ? <MapHint hidden={view === 'explore' && selected !== null} album={view === 'album'} /> : null}
            {cardShown && selected !== null && catalog ? (
              <MapCard
                key={selected}
                album={toSummary(catalog.albums, selected)}
                stop={stop}
                onClose={() => {
                  keepFocusOnMap(paneRef.current);
                  useAppStore.getState().setSelected(null);
                }}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
