import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataLoadError, loadCatalog, loadPositions, peekCatalog, peekPositions, resetDataCache } from './client';

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

  it('keeps the underlying cause', async () => {
    const offline = new TypeError('offline');
    vi.stubGlobal('fetch', vi.fn(async () => { throw offline; }));
    const err = await loadPositions().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataLoadError);
    expect((err as DataLoadError).cause).toBe(offline);
    expect((err as DataLoadError).status).toBeNull();
    expect((err as DataLoadError).url).toBe('/data/positions.json');
  });

  it('rejects with DataLoadError when a 200 response is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })));
    const err = await loadCatalog().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataLoadError);
    expect((err as DataLoadError).cause).toBeInstanceOf(SyntaxError);
    expect(peekCatalog()).toBeNull();
  });

  it('rejects with DataLoadError when the JSON has the wrong shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await expect(loadCatalog()).rejects.toBeInstanceOf(DataLoadError);
    await expect(loadPositions()).rejects.toBeInstanceOf(DataLoadError);
  });

  it('rejects with DataLoadError when albums.json holds a null album', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('albums.json') ? [null] : VOCAB), { status: 200 }),
    ));
    const err = await loadCatalog().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataLoadError);
    expect((err as DataLoadError).url).toBe('/data/albums.json');
    expect((err as DataLoadError).cause).toBeInstanceOf(TypeError);
    expect(peekCatalog()).toBeNull();
  });

  it('fetches positions once and memoises them', async () => {
    const f = okFetch();
    vi.stubGlobal('fetch', f);
    expect(peekPositions()).toBeNull();
    const [a, b] = await Promise.all([loadPositions(), loadPositions()]);
    expect(a).toBe(b);
    expect(await loadPositions()).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
    expect(peekPositions()).toBe(a);
  });
});
