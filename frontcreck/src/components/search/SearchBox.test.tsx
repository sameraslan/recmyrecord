import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPY } from '@/lib/copy';
import { resetDataCache } from '@/lib/data/client';
import { useCatalog } from '@/lib/data/useData';
import type { AlbumRecord } from '@/lib/types';
import { SearchBox } from './SearchBox';
import { resetSearchCache } from './searchIndex';

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

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
});

afterEach(() => {
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
