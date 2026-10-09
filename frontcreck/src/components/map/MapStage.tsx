'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toSummary } from '@/lib/data/catalog';
import { themeFor } from '@/lib/data/theme';
import { useCatalog, usePositions, useThemeLoad } from '@/lib/data/useData';
import { HEADER_NARROW_PX, HEADER_PX, useIsNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import type { StopId } from '@/lib/types';
import { albumHref, replaceBy, viewFromPathname, type View } from '@/lib/url-state';
import { ErrorPanel } from '@/components/ErrorPanel';
import { MapWhenLoaded, loadMapChunk, noNebula, useMapBoot, useMapCodeFailed, useMapShown } from './boot';
import { buildMapData } from './data';
import { DESKTOP_FIT_PADDING, DESKTOP_PADDING, PHONE_FIT_PADDING, PHONE_PADDING, PHONE_SLIDER_COVER_FALLBACK_PX, PHONE_SLIDER_MARGIN_PX } from './framing';
import { ExploreHere } from './overlays/ExploreHere';
import { GasPlaceholder } from './overlays/GasPlaceholder';
import { MapCard } from './overlays/MapCard';
import { MapHint } from './overlays/MapHint';
import { NoWebGL } from './overlays/NoWebGL';
import { SimilaritySlider } from './overlays/SimilaritySlider';
import { ZoomControls } from './overlays/ZoomControls';
import type { MapApi, MapCallbacks, MapInput } from './types';

/** Space kept between a flown-to album and the top of the phone card (bottom sheet). */
const PHONE_CARD_MARGIN_PX = 16;

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

/** The one persistent map (mounted in the root layout), plus its overlays. Routes only change its inputs. */
export function MapStage() {
  const pathname = usePathname();
  const view = viewFromPathname(pathname);
  const router = useRouter();
  const narrow = useIsNarrow();
  const webgl = useAppStore((s) => s.webgl);
  const stop = useAppStore((s) => s.stop);
  const focus = useAppStore((s) => s.focus);
  const hot = useAppStore((s) => s.hot);
  const selected = useAppStore((s) => s.selected);
  const panelInset = useAppStore((s) => s.panelInset);
  const mapModeFor = useAppStore((s) => s.mapModeFor);
  // Phone map mode belongs to one album: on a pick the new URL turns it off before the old panel unmounts.
  const mapMode = mapModeFor !== null && pathname === `/album/${mapModeFor}`;
  const noAudio = useAppStore((s) => s.noAudio);

  // The album list is asked for as the page's script runs; the rest of what the map needs (positions, theme, the
  // nebula image, the map's code) right after first paint, side by side, or after the album list when a visitor is
  // at the search field (boot.ts says why). Only drawing waits for the WebGL probe.
  const started = useMapBoot();
  const enabled = webgl === 'ok';
  const { status: catalogStatus, catalog, retry: retryCatalog } = useCatalog();
  const { status: positionsStatus, positions, retry: retryPositions } = usePositions(started);
  // No map without WebGL, so no map data either (and none of the controls that stand on it).
  const mapData = useMemo(() => (enabled && catalog && positions ? buildMapData(catalog.albums, positions) : null), [enabled, catalog, positions]);
  // The map mounts in a render of its own, after the one the data arrived in: reading the album list and starting
  // three.js (the renderer, the WebGL context) in one task was a long task of up to 175 ms on a slow connection,
  // where the album list is the last thing to arrive.
  const mountData = useDeferredValue(mapData);
  // The theme is optional. Missing, failed or built for another album count, the map goes on with plain sky.
  const { status: themeStatus, theme: loadedTheme } = useThemeLoad(started);
  const theme = mapData ? themeFor(loadedTheme, mapData.n) : null;
  useEffect(() => {
    // The theme failed, or is for another album list: no nebula will come (boot.ts noNebula).
    if (themeStatus === 'error' || (mapData !== null && loadedTheme !== null && theme === null)) noNebula();
  }, [themeStatus, mapData, loadedTheme, theme]);

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
      explore: view === 'explore',
      dimmed,
      insetLeft: view === 'album' && !narrow ? panelInset : 0,
      insetTop: narrow ? HEADER_NARROW_PX : HEADER_PX,
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
  // coming back from an album (its close control, Escape or the header nav) restores it, or frames the whole map;
  // coming from Home, About or 404 with nothing saved glides to the opening view (the Overview); leaving for Home
  // with the Overview untouched glides back to the whole map and keeps nothing.
  // "Explore this area" is the exception: it asks for Explore with the camera left where the album had it.
  const prevView = useRef<View>(view);
  const pendingReturn = useRef(false);
  const exploreHere = useRef(false);
  const pendingOpening = useRef(false);
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
    if (apiRef.current?.homeBackdrop(view)) s.saveExploreCamera(null);
    pendingReturn.current = view === 'explore' && prev === 'album' && !exploreHere.current;
    // Home, About or 404 to the map, with no camera saved in Explore: the map glides to its opening view (Task 0,
    // prototype app.js L118). A saved camera stays where the visitor left it.
    pendingOpening.current = view === 'explore' && (prev === 'home' || prev === 'about' || prev === 'other') && s.exploreCamera === null;
    exploreHere.current = false;
  }, [view]);
  // The pathname can change a commit before the album panel unmounts and clears the focus, so the camera moves
  // only once the map input has no focus (MusicMap applies the input in its layout effect, before this one);
  // otherwise Reset would frame the album just left and the album framing could follow the restore.
  // The opening glide (Home, About or 404 to the map) runs in the same commit. Without a map yet there is nothing to
  // move: when the map mounts, InitialFrame opens it at the same framing. pendingReturn (from an album) and
  // pendingOpening (from a page) never hold together. Keep this file under 20,000 bytes: past that Turbopack splits
  // its first-load chunk in two (+0.6 KB, measured in Task 0).
  useLayoutEffect(() => {
    if (view !== 'explore' || input.focus !== null) return;
    if (pendingOpening.current) {
      pendingOpening.current = false;
      apiRef.current?.opening(true);
    }
    if (!pendingReturn.current || !apiRef.current) return;
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

  const onExploreHere = useCallback(() => {
    exploreHere.current = true;
    // Dropped before the route changes: with the focus still set, the panel inset easing away would reframe it.
    useAppStore.getState().setFocus(null);
    router.push('/map');
  }, [router]);

  // Without WebGL there is no map to miss its data: the no-WebGL message stands alone.
  const codeFailed = useMapCodeFailed();
  const failed = webgl !== 'unavailable' && (catalogStatus === 'error' || positionsStatus === 'error' || codeFailed);
  // The zoom buttons, which need the map, come in with the canvas, never a frame ahead of it.
  const shown = useMapShown();
  return (
    <div
      ref={paneRef}
      className={`map-pane${dimmed ? ' is-dimmed' : ''}`}
      data-view={view}
      data-mapmode={view === 'album' && narrow && mapMode ? 'true' : 'false'}
      data-shown={shown ? '1' : '0'}
      // The phone zoom controls sit above the measured slider panel (styles/map.css).
      style={measuredCover !== null ? ({ '--slider-cover': `${measuredCover}px` } as React.CSSProperties) : undefined}
    >
      {/* No stand-in behind the no-WebGL message or the error panel: neither has a map coming under it. */}
      <GasPlaceholder view={view} off={webgl === 'unavailable' || failed} />
      <div className="map-host">
        {mountData ? (
          <MapWhenLoaded data={mountData} theme={theme} input={input} callbacks={callbacks} initialCamera={null} onApi={onApi} />
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
            void loadMapChunk();
          }}
        />
      ) : null}
      {/* Follows the visible map, right of the album panel (mockup body[data-view="album"] .map-ui). */}
      <div className={`map-ui${cardShown ? ' has-card' : ''}`} style={{ left: input.insetLeft }}>
        {interactive ? (
          <>
            <SimilaritySlider stop={stop} onChange={onStop} noAudio={view === 'album' && noAudio} />
            {mapData && view === 'album' && focus ? <ExploreHere onClick={onExploreHere} /> : null}
            {mapData ? <ZoomControls api={apiRef} /> : null}
            {/* The hint line is in the server HTML, over the stand-in nebula, so it is there from the first paint (it
             * is the largest text of /map: held back until the map showed, it was the page's largest contentful
             * paint, half a second late). Not where no map is coming: without WebGL, or when the data failed. */}
            {webgl !== 'unavailable' && !failed && (view === 'explore' || view === 'album') ? <MapHint hidden={view === 'album' || selected !== null} /> : null}
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
