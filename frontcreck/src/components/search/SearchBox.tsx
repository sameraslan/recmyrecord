'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { getSearch, type LoadedSearch } from '@/components/search/searchIndex';
import { registerSearchTarget } from '@/components/search/shortcut';
import { COPY } from '@/lib/copy';
import { toSummary } from '@/lib/data/catalog';
import { suppressGhostClick } from '@/lib/ghost-click';
import { splitHighlights, type HighlightRange } from '@/lib/highlight';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import type { AlbumId } from '@/lib/types';
import { albumHref } from '@/lib/url-state';

let readyMarked = false;

export interface SearchBoxProps {
  variant: 'hero' | 'header' | 'sheet' | 'page';
  label?: string;
  /** Focus on mount, desktop only (the hero). */
  autoFocus?: boolean;
  /** Show the `/` key hint. */
  showKbd?: boolean;
  /** Register for the global `/` shortcut. */
  shortcut?: boolean;
  onChosen?: (id: AlbumId) => void;
  /** Escape pressed on an empty, closed field. */
  onEscapeEmpty?: () => void;
}

function Marked({ text, ranges }: { text: string; ranges: HighlightRange[] }) {
  return (
    <>
      {splitHighlights(text, ranges).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

/** The no-match sentence with the query in bold. The copy is split on a sentinel, not searched for the
 * query, so a query that also occurs in the sentence itself (for example "al") is bolded in the right place. */
const NO_MATCH_SENTINEL = '\u0000';
const [NO_MATCH_BEFORE, NO_MATCH_AFTER] = COPY.search.noMatches(NO_MATCH_SENTINEL).split(NO_MATCH_SENTINEL);

function NoMatches({ query }: { query: string }) {
  return (
    <p className="combo-empty">
      {NO_MATCH_BEFORE}
      <b>{query}</b>
      {NO_MATCH_AFTER}
    </p>
  );
}

export function SearchBox({ variant, label = COPY.search.label, autoFocus = false, showKbd = false, shortcut = false, onChosen, onEscapeEmpty }: SearchBoxProps) {
  const router = useRouter();
  const uid = useId();
  const inputId = `${uid}-in`;
  const listId = `${uid}-lb`;
  const hintId = `${uid}-hint`;
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pressing = useRef(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState<LoadedSearch | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [announce, setAnnounce] = useState('');

  const ensureIndex = useCallback(() => {
    if (loaded) return;
    getSearch().then(
      (s) => {
        setLoaded(s);
        setLoadFailed(false);
      },
      () => setLoadFailed(true),
    );
  }, [loaded]);

  const trimmed = query.trim();
  const hits = useMemo(() => (loaded && trimmed ? loaded.search(loaded.index, query) : []), [loaded, query, trimmed]);
  const activeIndex = hits.length ? Math.min(active, hits.length - 1) : -1;
  const listShown = open && trimmed !== '' && hits.length > 0;
  const emptyShown = open && trimmed !== '' && !!loaded && hits.length === 0;
  const errorShown = open && trimmed !== '' && !loaded && loadFailed;

  useEffect(() => {
    if (readyMarked) return;
    readyMarked = true;
    performance.mark('rmr-search-ready');
  }, []);

  useEffect(() => {
    if (autoFocus && !isNarrow()) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (!shortcut) return;
    return registerSearchTarget({ el: () => inputRef.current, focus: () => inputRef.current?.focus() });
  }, [shortcut]);

  useEffect(() => {
    if (!trimmed || !loaded) return;
    const t = window.setTimeout(() => setAnnounce(hits.length ? COPY.search.found : COPY.search.none), 350);
    return () => window.clearTimeout(t);
  }, [hits, trimmed, loaded]);

  useEffect(() => {
    const h = activeIndex >= 0 ? hits[activeIndex] : undefined;
    if (h && loaded) router.prefetch(albumHref(loaded.catalog.albums[h.id].slug, useAppStore.getState().stop));
  }, [activeIndex, hits, loaded, router]);

  const choose = useCallback(
    (id: AlbumId) => {
      pressing.current = false;
      if (!loaded) return;
      const slug = loaded.catalog.albums[id].slug;
      setOpen(false);
      setQuery('');
      setActive(0);
      inputRef.current?.blur();
      router.push(albumHref(slug, useAppStore.getState().stop));
      onChosen?.(id);
    },
    [loaded, router, onChosen],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setOpen(true);
      setActive((a) => (Math.min(a, hits.length - 1) + d + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      if (listShown && activeIndex >= 0) {
        e.preventDefault();
        choose(hits[activeIndex].id);
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (listShown || emptyShown || errorShown) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        setQuery('');
      } else {
        inputRef.current?.blur();
        onEscapeEmpty?.();
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (boxRef.current?.contains(e.relatedTarget as Node | null)) return;
    window.setTimeout(() => {
      if (!pressing.current && !boxRef.current?.contains(document.activeElement)) setOpen(false);
    }, 0);
  };

  return (
    <div className={`combo combo--${variant}`} ref={boxRef} onBlur={onBlur}>
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <div className="combo-field">
        <Icon name="search" strokeWidth={1.6} />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-autocomplete="list"
          aria-expanded={listShown}
          aria-controls={listId}
          aria-activedescendant={listShown && activeIndex >= 0 ? `${uid}-o${activeIndex}` : undefined}
          aria-describedby={hintId}
          placeholder={COPY.search.placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            ensureIndex();
          }}
          onFocus={() => {
            ensureIndex();
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {showKbd ? (
          <span className="kbd" aria-hidden="true">
            /
          </span>
        ) : null}
      </div>
      <span className="sr-only" id={hintId}>
        {COPY.search.hint}
      </span>
      <div
        className="combo-pop"
        hidden={!(listShown || emptyShown || errorShown)}
        onPointerDown={() => {
          pressing.current = true;
        }}
        onPointerCancel={() => {
          pressing.current = false;
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <ul role="listbox" id={listId} aria-label={COPY.search.listLabel} hidden={!listShown}>
          {loaded
            ? hits.map((h, k) => {
                const a = toSummary(loaded.catalog.albums, h.id);
                return (
                  <li
                    key={h.id}
                    id={`${uid}-o${k}`}
                    role="option"
                    aria-selected={k === activeIndex}
                    className="opt"
                    data-album={a.slug}
                    onPointerDown={(e) => {
                      if (e.pointerType === 'mouse' && e.button === 0) {
                        e.preventDefault();
                        choose(h.id);
                      }
                    }}
                    onPointerUp={(e) => {
                      if (e.pointerType !== 'mouse') {
                        e.preventDefault();
                        suppressGhostClick(e.clientX, e.clientY);
                        choose(h.id);
                      }
                    }}
                    onClick={() => choose(h.id)}
                    onMouseMove={() => {
                      if (k !== activeIndex) setActive(k);
                    }}
                  >
                    <Cover album={a} size={44} />
                    <div className="opt-text">
                      <div className="opt-t">
                        <Marked text={a.title} ranges={h.title} />
                      </div>
                      <div className="opt-a">
                        <Marked text={a.artist} ranges={h.artist} />
                      </div>
                    </div>
                  </li>
                );
              })
            : null}
        </ul>
        {emptyShown ? <NoMatches query={trimmed} /> : null}
        {errorShown ? (
          <div className="combo-error" role="alert">
            <p>{COPY.error.body}</p>
            <button type="button" className="btn btn-line" onClick={ensureIndex}>
              {COPY.error.retry}
            </button>
          </div>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
