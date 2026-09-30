'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';
import { COPY } from '@/lib/copy';
import { REC_DEFAULT_VISIBLE, REC_MAX } from '@/lib/data/catalog';
import { previousPath } from '@/lib/nav-history';
import { useAppStore } from '@/lib/store';
import type { AlbumPageData, StopId } from '@/lib/types';
import { AmbientLayers } from './AmbientWash';
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
  const rows = data.recs[stop];
  const visible = rows.slice(0, expanded ? REC_MAX : REC_DEFAULT_VISIBLE);
  const visibleKey = visible.map((r) => r.id).join(',');
  const hot = useAppStore((s) => s.hot);
  const lit = new Set(rows.find((r) => r.id === hot)?.shared ?? []);

  const close = useCallback(() => router.push('/map'), [router]);

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
      s.setMapMode(false);
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
      if (useAppStore.getState().mapMode) return; // phone map mode handles its own Escape (Task 11)
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <section className="album" ref={panelRef} aria-label={COPY.album.regionLabel(seed.title)}>
      <AmbientLayers ambient={seed.ambient} variant="panel" />
      <button type="button" className="album-close" aria-label={COPY.album.close} onClick={close}>
        <Icon name="x" strokeWidth={1.6} />
      </button>
      <div className="album-scroll" ref={scrollRef}>
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
    </section>
  );
}
