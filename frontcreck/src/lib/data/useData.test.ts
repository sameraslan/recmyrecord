import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCatalog, resetDataCache } from './client';
import { useCatalog, usePositions } from './useData';

const ALBUMS = [{ slug: 'a-b', t: 'A', a: 'B', s: '', c: '', k: 0, d: [0], w: ['#111111', '#222222', '#d9a066'] }];
const VOCAB = ['lush'];
const POSITIONS = { sonic: [0, 0], balanced: [0, 0], mood: [0, 0] };

/** fetch that fails until `ok` is set, then serves the fixtures. */
function switchableFetch() {
  const state = { ok: false };
  const fn = vi.fn(async (url: string) => {
    if (!state.ok) return new Response('nope', { status: 503 });
    const body = url.endsWith('albums.json') ? ALBUMS : url.endsWith('vocab.json') ? VOCAB : POSITIONS;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { state, fn };
}

afterEach(() => {
  cleanup();
  resetDataCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('data hooks', () => {
  it('shares loading, error and retry across every consumer', async () => {
    const { state, fn } = switchableFetch();
    vi.stubGlobal('fetch', fn);
    const a = renderHook(() => useCatalog());
    const b = renderHook(() => useCatalog());
    expect(a.result.current.status).toBe('loading');
    expect(b.result.current.status).toBe('loading');
    await waitFor(() => expect(a.result.current.status).toBe('error'));
    expect(b.result.current.status).toBe('error');
    expect(b.result.current.catalog).toBeNull();

    state.ok = true;
    act(() => a.result.current.retry());
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(a.result.current.status).toBe('ready');
    expect(a.result.current.catalog).toBe(b.result.current.catalog);
    expect(b.result.current.catalog?.bySlug.get('a-b')).toBe(0);
  });

  it('shows loading on every consumer while a retry is in flight', async () => {
    const { state, fn } = switchableFetch();
    vi.stubGlobal('fetch', fn);
    const a = renderHook(() => usePositions());
    const b = renderHook(() => usePositions());
    await waitFor(() => expect(b.result.current.status).toBe('error'));
    state.ok = true;
    act(() => b.result.current.retry());
    expect(a.result.current.status).toBe('loading');
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    expect(a.result.current.positions).toBe(b.result.current.positions);
  });

  it('does not fetch while disabled and starts when enabled', async () => {
    const { state, fn } = switchableFetch();
    state.ok = true;
    vi.stubGlobal('fetch', fn);
    const h = renderHook(({ on }) => useCatalog(on), { initialProps: { on: false } });
    expect(h.result.current.status).toBe('idle');
    expect(fn).not.toHaveBeenCalled();
    h.rerender({ on: true });
    await waitFor(() => expect(h.result.current.status).toBe('ready'));
  });

  it('is ready on the first render when the data is already loaded', async () => {
    const { state, fn } = switchableFetch();
    state.ok = true;
    vi.stubGlobal('fetch', fn);
    const catalog = await loadCatalog();
    const h = renderHook(() => useCatalog());
    expect(h.result.current.status).toBe('ready');
    expect(h.result.current.catalog).toBe(catalog);
  });

  it('uses a stable server snapshot that ignores the client cache', async () => {
    const { state, fn } = switchableFetch();
    state.ok = true;
    vi.stubGlobal('fetch', fn);
    const errors = vi.spyOn(console, 'error');
    function Probe() {
      const c = useCatalog();
      const p = usePositions(false);
      return createElement('p', null, `${c.status} ${c.catalog === null} ${p.status}`);
    }
    expect(renderToString(createElement(Probe))).toBe('<p>loading true idle</p>');
    await loadCatalog();
    expect(renderToString(createElement(Probe))).toBe('<p>loading true idle</p>');
    expect(errors).not.toHaveBeenCalled();
  });
});
