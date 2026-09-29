import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataLoadError, loadCatalog, loadPositions, peekCatalog, resetDataCache } from './client';

const ALBUMS = [{ slug: 'a-b', t: 'A', a: 'B', s: '', c: '', k: 0, d: [0], w: ['#111111', '#222222', '#d9a066'] }];
const VOCAB = ['lush'];

function okFetch() {
  return vi.fn(async (url: string) => {
    const body = url.endsWith('albums.json') ? ALBUMS : url.endsWith('vocab.json') ? VOCAB : { sonic: [0, 0], balanced: [0, 0], mood: [0, 0] };
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

afterEach(() => {
  resetDataCache();
  vi.unstubAllGlobals();
});

describe('client loaders', () => {
  it('fetches the catalog once and memoises it', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([loadCatalog(), loadCatalog()]);
    expect(a).toBe(b);
    expect(a.bySlug.get('a-b')).toBe(0);
    expect(f).toHaveBeenCalledTimes(2);
    expect(peekCatalog()).toBe(a);
  });

  it('rejects with DataLoadError on HTTP errors and retries on the next call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await expect(loadCatalog()).rejects.toBeInstanceOf(DataLoadError);
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    await expect(loadCatalog()).resolves.toBeTruthy();
    expect(f).toHaveBeenCalled();
  });

  it('rejects with DataLoadError when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(loadPositions()).rejects.toBeInstanceOf(DataLoadError);
  });
});
