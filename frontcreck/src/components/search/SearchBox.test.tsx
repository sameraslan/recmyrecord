import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { COPY } from '@/lib/copy';
import { resetDataCache } from '@/lib/data/client';
import { useCatalog } from '@/lib/data/useData';
import type { AlbumRecord } from '@/lib/types';
import fs from 'node:fs';
import Fuse from 'fuse.js';
import path from 'node:path';
import { SearchBox } from './SearchBox';
import { SearchSheet } from './SearchSheet';
import { resetSearchCache } from './searchIndex';

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

/** The search module as the lazy loader hands it over, with the typo step spied on; `failures` makes
 * the next loads reject like a chunk that did not download. */
type FuzzySearch = typeof import('@/lib/search').fuzzySearch;
const chunk = vi.hoisted(() => ({ failures: 0, fuzzy: null as null | Mock<FuzzySearch> }));
vi.mock('./loadSearchModule', async () => {
  const real = await vi.importActual<typeof import('@/lib/search')>('@/lib/search');
  const fuzzy = vi.fn<FuzzySearch>(real.fuzzySearch);
  chunk.fuzzy = fuzzy;
  const mod = { ...real, fuzzySearch: fuzzy };
  return {
    loadSearchModule: vi.fn(async () => {
      if (chunk.failures > 0) {
        chunk.failures--;
        throw new TypeError('Failed to fetch dynamically imported module');
      }
      return mod;
    }),
  };
});
const fuzzy = () => chunk.fuzzy!;

const rec = (slug: string, t: string, a: string): AlbumRecord => ({ slug, t, a, s: '', c: '', k: 0, d: [], w: ['#111111', '#222222', '#d9a066'] });
const ALBUMS = [
  rec('ok-computer-radiohead', 'OK Computer', 'Radiohead'),
  rec('kid-a-radiohead', 'Kid A', 'Radiohead'),
  rec('amnesiac-radiohead', 'Amnesiac', 'Radiohead'),
];

/** fetch serving the fixture catalog, or failing with 503 while `ok` is false. */
function catalogFetch(ok = true) {
  const state = { ok };
  const fn = vi.fn(async (url: string) => {
    if (!state.ok) return new Response('nope', { status: 503 });
    return new Response(JSON.stringify(url.endsWith('albums.json') ? ALBUMS : ['lush']), { status: 200 });
  });
  vi.stubGlobal('fetch', fn);
  return state;
}

const input = () => screen.getByRole('combobox');
const options = () => screen.queryAllByRole('option');
const selected = () => options().findIndex((o) => o.getAttribute('aria-selected') === 'true');

async function typeQuery(text: string) {
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value: text } });
}

beforeEach(() => {
  router.push.mockReset();
  router.prefetch.mockReset();
  chunk.failures = 0;
  fuzzy().mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  resetSearchCache();
  resetDataCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SearchBox keyboard', () => {
  it('ignores keys while an IME is composing', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await typeQuery('radiohead');
    await waitFor(() => expect(options()).toHaveLength(3));
    expect(selected()).toBe(0);
    fireEvent.keyDown(input(), { key: 'ArrowDown', isComposing: true });
    expect(selected()).toBe(0);
    fireEvent.keyDown(input(), { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input(), { key: 'Escape', keyCode: 229 });
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox', { hidden: true })).toBeVisible();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(router.push).toHaveBeenCalledWith('/album/ok-computer-radiohead');
  });

  it('Escape clears the active option so the next ArrowDown starts at the first', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await typeQuery('radiohead');
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(selected()).toBe(1);
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(selected()).toBe(0);
  });

  it('Enter with no active option chooses the first result, and does nothing without results', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await typeQuery('radiohead');
    await waitFor(() => expect(options()).toHaveLength(3));
    fireEvent.keyDown(input(), { key: 'Escape' });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(router.push).toHaveBeenCalledWith('/album/ok-computer-radiohead');
    router.push.mockReset();
    await typeQuery('zzkq');
    await waitFor(() => expect(document.querySelector('.combo-empty')).toHaveTextContent(COPY.search.noMatches('zzkq')));
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('limits the query length', () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    expect(input()).toHaveAttribute('maxlength', '80');
  });
});

describe('SearchBox live region', () => {
  it('clears the announcement for a new query so an unchanged message is announced again', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    const live = () => document.querySelector('[aria-live="polite"]')!.textContent;
    await typeQuery('zzkq');
    await waitFor(() => expect(live()).toBe(COPY.search.none));
    fireEvent.change(input(), { target: { value: 'zzkqq' } });
    expect(live()).toBe('');
    await waitFor(() => expect(live()).toBe(COPY.search.none));
  });
});

describe('SearchBox data errors', () => {
  it('shows the shared error, clears it when another consumer recovers, and shows loading on retry', async () => {
    const net = catalogFetch(false);
    render(<SearchBox variant="header" />);
    await typeQuery('kid');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(COPY.error.body);

    // Another consumer of the same catalog retries successfully: this field recovers too.
    net.ok = true;
    const other = renderHook(() => useCatalog());
    act(() => other.result.current.retry());
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry restarts the shared load and hides the error while it runs', async () => {
    const net = catalogFetch(false);
    render(<SearchBox variant="header" />);
    await typeQuery('kid');
    await screen.findByRole('alert');
    net.ok = true;
    fireEvent.click(screen.getByRole('button', { name: COPY.error.retry }));
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(options()).toHaveLength(1));
  });
});

describe('SearchBox in the sheet', () => {
  it('keeps the results visible when the field loses focus', async () => {
    catalogFetch();
    render(<SearchBox variant="sheet" />);
    await typeQuery('radiohead');
    await waitFor(() => expect(options()).toHaveLength(3));
    act(() => input().blur());
    fireEvent.blur(input());
    await new Promise((r) => setTimeout(r, 20));
    expect(options()).toHaveLength(3);
    expect(input()).toHaveAttribute('aria-expanded', 'true');
  });
});

/** Loads the index with real timers (an initial prefix query), then switches to fake timers. */
async function loadThenFakeTimers() {
  await typeQuery('radio');
  await waitFor(() => expect(options()).toHaveLength(3));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
}
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const empty = () => document.querySelector('.combo-empty');
const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

describe('SearchBox typo fallback', () => {
  it('never runs the typo step synchronously on input, and runs it once after a 160 ms pause', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await loadThenFakeTimers();
    const fuse = vi.spyOn(Fuse.prototype, 'search');
    fireEvent.change(input(), { target: { value: 'radiohed' } });
    expect(fuzzy()).not.toHaveBeenCalled();
    expect(fuse).not.toHaveBeenCalled();
    expect(options()).toHaveLength(0);
    advance(159);
    expect(fuzzy()).not.toHaveBeenCalled();
    advance(1);
    expect(fuzzy()).toHaveBeenCalledTimes(1);
    expect(options().map((o) => o.querySelector('.opt-t')!.textContent)).toEqual(['OK Computer', 'Kid A', 'Amnesiac']);
    advance(1000);
    expect(fuzzy()).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending run when the user types again, selects or closes the list', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await loadThenFakeTimers();
    fireEvent.change(input(), { target: { value: 'radiohed' } });
    advance(100);
    fireEvent.change(input(), { target: { value: 'radiohedd' } });
    advance(100);
    expect(fuzzy()).not.toHaveBeenCalled();
    advance(60);
    expect(fuzzy()).toHaveBeenCalledTimes(1);
    expect(fuzzy().mock.calls[0][1]).toBe('radiohedd');

    fuzzy().mockClear();
    fireEvent.change(input(), { target: { value: 'radiohex' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    advance(500);
    expect(fuzzy()).not.toHaveBeenCalled();
  });

  it('discards a typo result that arrives for a query that is no longer current', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await loadThenFakeTimers();
    const real = fuzzy().getMockImplementation()!;
    // A keystroke lands while the typo step for "radiohed" is running.
    fuzzy().mockImplementationOnce((index, query, limit) => {
      const hits = real(index, query, limit);
      fireEvent.change(input(), { target: { value: 'zzzzq' } });
      return hits;
    });
    fireEvent.change(input(), { target: { value: 'radiohed' } });
    advance(160);
    expect(input()).toHaveValue('zzzzq');
    expect(options()).toHaveLength(0);
    expect(empty()).toBeNull();
    advance(160);
    expect(fuzzy()).toHaveBeenCalledTimes(2);
    expect(options()).toHaveLength(0);
    expect(empty()).toHaveTextContent(COPY.search.noMatches('zzzzq'));
  });

  it('shows the no-match sentence only once the typo step has finished empty, and announces only then', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await loadThenFakeTimers();
    advance(400);
    fireEvent.change(input(), { target: { value: 'zzzzq' } });
    expect(empty()).toBeNull();
    expect(screen.getByRole('listbox', { hidden: true })).not.toBeVisible();
    advance(159);
    expect(empty()).toBeNull();
    advance(349);
    expect(live()).toBe('');
    advance(1);
    expect(empty()).toHaveTextContent(COPY.search.noMatches('zzzzq'));
    expect(live()).toBe('');
    advance(350);
    expect(live()).toBe(COPY.search.none);
  });

  it('shows the no-match sentence at once for queries outside the typo range', async () => {
    catalogFetch();
    render(<SearchBox variant="header" />);
    await loadThenFakeTimers();
    fireEvent.change(input(), { target: { value: 'zzq' } });
    expect(empty()).toHaveTextContent(COPY.search.noMatches('zzq'));
    fireEvent.change(input(), { target: { value: 'z'.repeat(17) } });
    expect(empty()).toHaveTextContent(COPY.search.noMatches('z'.repeat(17)));
    advance(1000);
    expect(fuzzy()).not.toHaveBeenCalled();
  });
});

describe('SearchBox keystroke cost (real catalog)', () => {
  it('handles a 32-character no-match keystroke synchronously in under 5 ms', async () => {
    const dir = path.join(process.cwd(), 'public/data');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => new Response(fs.readFileSync(path.join(dir, url.split('/').pop()!), 'utf8'), { status: 200 })),
    );
    render(<SearchBox variant="header" />);
    await typeQuery('radiohead');
    await waitFor(() => expect(options()).toHaveLength(6));
    const q = 'qzxvbnmkqzxvbnmkqzxvbnmkqzxvbnmk';
    const fuse = vi.spyOn(Fuse.prototype, 'search');
    // Each keystroke alternates between the 31- and 32-character query; the first few warm up the JIT.
    const times: number[] = [];
    for (let i = 0; i < 16; i++) {
      const value = i % 2 ? q : q.slice(0, 31);
      const t0 = performance.now();
      fireEvent.change(input(), { target: { value } });
      if (i >= 5) times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1];
    expect(fuzzy()).not.toHaveBeenCalled();
    expect(fuse).not.toHaveBeenCalled();
    expect(median).toBeLessThan(5);
  });
});

describe('SearchBox search module failure', () => {
  it('shows the error when the search code fails to load, and Retry loads it and returns focus to the field', async () => {
    catalogFetch();
    chunk.failures = 1;
    render(<SearchBox variant="header" />);
    await typeQuery('kid');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(COPY.error.body);
    const retry = screen.getByRole('button', { name: COPY.error.retry });
    retry.focus();
    fireEvent.click(retry);
    expect(document.activeElement).toBe(input());
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(live()).toBe(COPY.search.found));
  });

  it('keeps the error block open on Tab so Retry can be reached', async () => {
    catalogFetch(false);
    render(<SearchBox variant="header" />);
    await typeQuery('kid');
    await screen.findByRole('alert');
    fireEvent.keyDown(input(), { key: 'Tab' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('SearchSheet', () => {
  it('ignores an Escape that belongs to an IME composition', () => {
    catalogFetch();
    const onClose = vi.fn();
    render(<SearchSheet onClose={onClose} />);
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Escape', keyCode: 229 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
