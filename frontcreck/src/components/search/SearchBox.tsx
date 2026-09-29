'use client';

import { useRouter } from 'next/navigation';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Cover } from '@/components/Cover';
import { Icon } from '@/components/Icon';
import { getSearch, type LoadedSearch } from '@/components/search/searchIndex';
import { registerSearchTarget } from '@/components/search/shortcut';
import { COPY } from '@/lib/copy';
import { toSummary } from '@/lib/data/catalog';
import { DataLoadError } from '@/lib/data/client';
import { useCatalog } from '@/lib/data/useData';
import { suppressGhostClick } from '@/lib/ghost-click';
import { splitHighlights, type HighlightRange } from '@/lib/highlight';
import { isNarrow } from '@/lib/media';
import { useAppStore } from '@/lib/store';
import type { SearchHit } from '@/lib/search';
import type { AlbumId } from '@/lib/types';
import { albumHref } from '@/lib/url-state';

let readyMarked = false;

/** The search fields accept at most this many characters (kept here, not in the lazily loaded search module). */
export const QUERY_MAX_CHARS = 80;

/** The typo step waits for this pause in typing, then runs when the browser is idle (or after IDLE_MAX_MS). */
const TYPO_PAUSE_MS = 160;
const IDLE_MAX_MS = 200;
const NO_HITS: SearchHit[] = [];

/** A press that opens the context menu instead of choosing: any button but the primary, or Ctrl+click on macOS. */
function isMenuPress(e: { button: number; ctrlKey: boolean }): boolean {
  return e.button !== 0 || (e.ctrlKey && /Mac/i.test(navigator.platform));
}

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
  /** True between a pointerdown inside the popover and the matching pointerup (or pointercancel). */
  const pressing = useRef(false);
  const stopPressing = useRef<(() => void) | null>(null);
  /** In the phone sheet the results stay until the sheet closes or the query is cleared. */
  const persistent = variant === 'sheet';
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /** Index of the active option, or -1 for none. */
  const [active, setActive] = useState(-1);
  /** Set on first focus or input: only then are the catalog and the search module loaded. */
  const [wanted, setWanted] = useState(false);
  const [loaded, setLoaded] = useState<LoadedSearch | null>(null);
  const [announce, setAnnounce] = useState('');
  /** The search code (a separate chunk) failed to load; local to this field, unlike the shared catalog state. */
  const [chunkFailed, setChunkFailed] = useState(false);
  /** Result of the last typo run, for the query it ran on. */
  const [typo, setTypo] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  // The shared catalog state: every consumer sees the same error, and any consumer's retry recovers all.
  const { status: catalogStatus, retry: retryCatalog } = useCatalog(wanted);

  useEffect(() => {
    if (!wanted || loaded || catalogStatus === 'error' || chunkFailed) return;
    let live = true;
    getSearch().then(
      (s) => {
        if (live) setLoaded(s);
      },
      (err: unknown) => {
        // Catalog failures show through the shared state; anything else is the search chunk.
        if (live && !(err instanceof DataLoadError)) setChunkFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, loaded, catalogStatus, chunkFailed]);

  const trimmed = query.trim();
  const shown = persistent || open;
  // The keystroke path: prefix matches only. The typo step never runs in render.
  const prefixHits = useMemo(() => (loaded && trimmed ? loaded.prefix(loaded.index, query) : NO_HITS), [loaded, query, trimmed]);
  const typoWanted = useMemo(() => !!loaded && prefixHits.length === 0 && trimmed !== '' && loaded.fuzzyEligible(query), [loaded, prefixHits, trimmed, query]);
  const typoHits = typo && typo.query === query ? typo.hits : null;
  const typoPending = typoWanted && typoHits === null;
  const hits = prefixHits.length ? prefixHits : (typoWanted && typoHits) || NO_HITS;
  const activeIndex = hits.length && active >= 0 ? Math.min(active, hits.length - 1) : -1;
  const listShown = shown && trimmed !== '' && hits.length > 0;
  // While a typo run is pending the list shows nothing, so the no-match sentence never flashes.
  const emptyShown = shown && trimmed !== '' && !!loaded && hits.length === 0 && !typoPending;
  const errorShown = shown && trimmed !== '' && !loaded && (catalogStatus === 'error' || chunkFailed);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  const closeIfOutside = useCallback(() => {
    if (!persistent && !pressing.current && !boxRef.current?.contains(document.activeElement)) close();
  }, [persistent, close]);

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

  useEffect(() => () => stopPressing.current?.(), []);

  // The typo step: only after prefix matching found nothing, for a short enough query, once the user has
  // paused, and when the browser is idle. A new keystroke, a selection, closing the list or unmounting
  // cancels it; a result for a query that is no longer current is dropped (here and in `typoHits`).
  useEffect(() => {
    if (!typoPending || !shown || !loaded) return;
    let cancelled = false;
    let idle: number | null = null;
    const go = () => {
      idle = null;
      const found = loaded.fuzzy(loaded.index, query);
      if (!cancelled) setTypo({ query, hits: found });
    };
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(go, { timeout: IDLE_MAX_MS });
      else go();
    }, TYPO_PAUSE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (idle !== null) window.cancelIdleCallback(idle);
    };
  }, [typoPending, shown, loaded, query]);

  // Only settled states are announced. The region is cleared on every edit (onChange), so this sets it
  // from empty and an unchanged message is announced again.
  useEffect(() => {
    if (!trimmed || !loaded || typoPending) return;
    const t = window.setTimeout(() => setAnnounce(hits.length ? COPY.search.found : COPY.search.none), 350);
    return () => window.clearTimeout(t);
  }, [hits, trimmed, loaded, typoPending]);

  useEffect(() => {
    const h = activeIndex >= 0 ? hits[activeIndex] : undefined;
    if (h && loaded) router.prefetch(albumHref(loaded.catalog.albums[h.id].slug, useAppStore.getState().stop));
  }, [activeIndex, hits, loaded, router]);

  const choose = useCallback(
    (id: AlbumId) => {
      stopPressing.current?.();
      if (!loaded) return;
      const slug = loaded.catalog.albums[id].slug;
      setOpen(false);
      setQuery('');
      setActive(-1);
      inputRef.current?.blur();
      router.push(albumHref(slug, useAppStore.getState().stop));
      onChosen?.(id);
    },
    [loaded, router, onChosen],
  );

  /** Marks a press inside the popover so a blur during it does not close the list; ends on pointerup. */
  const startPress = () => {
    pressing.current = true;
    if (stopPressing.current) return;
    const stop = () => {
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      stopPressing.current = null;
      pressing.current = false;
    };
    const end = () => {
      stop();
      window.setTimeout(closeIfOutside, 0);
    };
    stopPressing.current = stop;
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Keys that confirm or navigate an IME composition belong to the IME.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      const n = hits.length;
      setOpen(true);
      setActive((a) => (a < 0 ? (d > 0 ? 0 : n - 1) : (Math.min(a, n - 1) + d + n) % n));
    } else if (e.key === 'Enter') {
      if (!hits.length) return;
      e.preventDefault();
      choose(hits[activeIndex >= 0 ? activeIndex : 0].id);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (!persistent && (listShown || emptyShown || errorShown || (open && typoPending))) {
        e.preventDefault();
        close();
      } else if (query) {
        setQuery('');
        setActive(-1);
      } else {
        inputRef.current?.blur();
        onEscapeEmpty?.();
      }
    }
    // Tab is left to the browser: the list closes on blur only when focus leaves the combobox, so Tab
    // from the field reaches Retry in the error block.
  };

  /** Retry moves focus back to the field (the button unmounts once loading starts) and re-announces. */
  const onRetry = () => {
    inputRef.current?.focus();
    setAnnounce('');
    setChunkFailed(false);
    if (catalogStatus === 'error') retryCatalog();
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (boxRef.current?.contains(e.relatedTarget as Node | null)) return;
    window.setTimeout(closeIfOutside, 0);
  };

  const onOptionClick = (e: ReactMouseEvent, id: AlbumId) => {
    if (isMenuPress(e)) return;
    choose(id);
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
          maxLength={QUERY_MAX_CHARS}
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
            setAnnounce('');
            setWanted(true);
          }}
          onFocus={() => {
            setWanted(true);
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
        onPointerDown={startPress}
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
                      if (e.pointerType === 'mouse' && !isMenuPress(e)) {
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
                    onClick={(e) => onOptionClick(e, h.id)}
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
            <button type="button" className="btn btn-line" onClick={onRetry}>
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
