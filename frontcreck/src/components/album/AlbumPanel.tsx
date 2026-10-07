'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { REC_DEFAULT_VISIBLE, REC_MAX } from '@/lib/data/catalog';
import { prefersReducedMotion, useIsNarrow } from '@/lib/media';
import { entryFrom, previousPath, recordedPath } from '@/lib/nav-history';
import { useAppStore } from '@/lib/store';
import type { AlbumPageData, StopId } from '@/lib/types';
import { AmbientLayers } from './AmbientWash';
import { MapModeButton } from './MapModeButton';
import { MapPreviewStrip } from './MapPreviewStrip';
import { RecList } from './RecList';
import { SeedHeader } from './SeedHeader';
import { Trail } from './Trail';
import { usePanelInset } from './usePanelInset';

export function AlbumPanel({ data, stop }: { data: AlbumPageData; stop: StopId }) {
  const { seed } = data;
  const router = useRouter();
  const panelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === seed.slug;
  // How this panel arrived: slide in from Home, Explore or About, fade in from another album, still on a direct
  // load, and still under reduced motion (the CSS rule shortens animations, but a first frame could still show
  // the panel's start position).
  const [entry] = useState(() => (prefersReducedMotion() ? 'none' : entryFrom(`/album/${seed.slug}`, recordedPath(), previousPath())));
  // Phone map mode (the Map button, the strip): the panel slides away and the full map takes the screen. It only
  // exists under 900 px (a phone turned wide leaves it) and only for this album: a map pick opens the next album
  // as a list, which must not render hidden and inert while this panel's cleanup is still to come.
  const narrow = useIsNarrow();
  const mapMode = useAppStore((s) => s.mapModeFor === seed.slug) && narrow;
  const fabRef = useRef<HTMLButtonElement>(null);
  const rows = data.recs[stop];
  const visible = rows.slice(0, expanded ? REC_MAX : REC_DEFAULT_VISIBLE);
  const visibleKey = visible.map((r) => r.id).join(',');
  const hot = useAppStore((s) => s.hot);
  const lit = new Set(rows.find((r) => r.id === hot)?.shared ?? []);

  const close = useCallback(() => router.push('/map'), [router]);
  const setMapMode = useCallback((on: boolean) => {
    useAppStore.getState().setMapModeFor(on ? seed.slug : null);
    // The control that switched may be inside the panel that is becoming inert (the strip), so focus follows to
    // the one button that switches back.
    requestAnimationFrame(() => fabRef.current?.focus({ preventScroll: true }));
  }, [seed.slug]);

  useEffect(() => {
    if (!narrow && useAppStore.getState().mapModeFor !== null) useAppStore.getState().setMapModeFor(null);
  }, [narrow]);

  useEffect(() => {
    useAppStore.getState().visit({ slug: seed.slug, title: seed.title });
  }, [seed.slug, seed.title]);

  useEffect(() => {
    useAppStore.getState().setFocus({ seed: seed.id, recs: visibleKey ? visibleKey.split(',').map(Number) : [] });
  }, [seed.id, visibleKey]);

  useEffect(() => {
    useAppStore.getState().setAmbient(seed.ambient);
    document.documentElement.style.setProperty('--acc', seed.ambient[2]);
  }, [seed.ambient]);

  usePanelInset(panelRef);

  // The one place that clears the album view's state (the map inset is usePanelInset's): the close control,
  // Escape and every route change away from this album (including to another album) unmount this panel.
  useEffect(
    () => () => {
      const s = useAppStore.getState();
      s.setFocus(null);
      s.setHot(null);
      s.setAmbient(null);
      s.setMapModeFor(null);
      document.documentElement.style.removeProperty('--acc');
    },
    [],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    // Only after an in-app navigation (mockup focusQuiet): a direct load leaves focus alone, so the first Tab
    // still reaches the skip link and the search.
    if (previousPath() !== null) titleRef.current?.focus({ preventScroll: true });
  }, [seed.slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('textarea, select, [contenteditable="true"]')) return;
      if (t instanceof HTMLInputElement && t.type !== 'range') return;
      // Dialogs (the phone search sheet) and the search popover handle their own Escape.
      if (t?.closest('[aria-modal="true"], .combo')) return;
      // Phone map mode: Escape goes back to the list, not away from the album. Map mode exists only when narrow.
      if (narrow && useAppStore.getState().mapModeFor === seed.slug) {
        setMapMode(false);
        return;
      }
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, setMapMode, seed.slug, narrow]);

  return (
    <>
      <section
        className={`album${entry === 'slide' ? ' is-entering' : ''}${mapMode ? ' album--hidden' : ''}`}
        ref={panelRef}
        aria-label={COPY.album.regionLabel(seed.title)}
        aria-hidden={mapMode || undefined}
        inert={mapMode || undefined}
      >
        <AmbientLayers ambient={seed.ambient} />
        <button type="button" className="album-close" aria-label={COPY.album.close} onClick={close}>
          <Icon name="x" strokeWidth={1.6} />
        </button>
        <div className="album-scroll" ref={scrollRef}>
          {/* The element the album to album fade animates (only when this panel replaced another album's). */}
          <div className={entry === 'fade' ? 'fade-in' : undefined}>
            <Trail current={seed.slug} stop={stop} />
            <SeedHeader seed={seed} lit={lit} titleRef={titleRef} stop={stop} />
            <RecList
              seedId={seed.id}
              rows={visible}
              total={rows.length}
              stop={stop}
              expanded={expanded}
              onToggle={() => setExpandedFor(expanded ? null : seed.slug)}
            />
          </div>
          <MapPreviewStrip focus={{ seed: seed.id, recs: visible.map((r) => r.id) }} stop={stop} onOpen={() => setMapMode(true)} />
        </div>
      </section>
      <MapModeButton on={mapMode} onToggle={() => setMapMode(!mapMode)} buttonRef={fabRef} />
    </>
  );
}
