'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SearchBox } from '@/components/search/SearchBox';
import { COPY } from '@/lib/copy';
import { pickSurprise } from '@/lib/data/catalog';
import { loadCatalog } from '@/lib/data/client';
import { isNarrow } from '@/lib/media';
import { previousPath } from '@/lib/nav-history';
import { useAppStore } from '@/lib/store';
import { albumHref } from '@/lib/url-state';

export function HomeHero() {
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [busy, setBusy] = useState(false);

  // Desktop: the search field takes focus (SearchBox autoFocus), on every visit (spec 4.1). Phones: no
  // autofocus (it would open the keyboard); after an in-app navigation the heading takes focus so screen
  // readers announce the new view (mockup focusQuiet), and a direct load leaves focus alone.
  useEffect(() => {
    if (isNarrow() && previousPath() !== null) headingRef.current?.focus({ preventScroll: true });
  }, []);

  const surprise = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { albums } = await loadCatalog();
      router.push(albumHref(albums[pickSurprise(albums)].slug, useAppStore.getState().stop));
    } catch {
      useAppStore.getState().showToast(COPY.error.body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hero">
      <h1 id="home-h" tabIndex={-1} ref={headingRef}>
        {COPY.hero}
      </h1>
      <p className="lede">{COPY.heroSub}</p>
      <SearchBox variant="hero" autoFocus showKbd shortcut />
      <div className="hero-row">
        <Link className="textbtn u" href="/map">
          <span>{COPY.home.explore}</span>
        </Link>
        <span className="dot" aria-hidden="true" />
        <button type="button" className="textbtn" onClick={surprise} aria-busy={busy || undefined}>
          <span>{COPY.home.surprise}</span>
        </button>
      </div>
    </div>
  );
}
