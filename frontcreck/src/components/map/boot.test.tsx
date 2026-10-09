import fs from 'node:fs';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMarks } from '@/lib/marks';
import { useAppStore } from '@/lib/store';
import type { MusicMapProps } from './types';

const early = vi.hoisted(() => ({ startEarlyGas: vi.fn(), dropEarlyGas: vi.fn() }));
const webgl = vi.hoisted(() => ({ warmUpWebGL: vi.fn(), isWebGLAvailable: vi.fn() }));
const search = vi.hoisted(() => ({ searchWanted: vi.fn(() => false) }));
const data = vi.hoisted(() => ({ loadCatalog: vi.fn(), peekCatalog: vi.fn(() => null as unknown) }));
vi.mock('@/lib/data/early', () => early);
vi.mock('@/components/search/searchIndex', () => search);
vi.mock('@/lib/data/client', () => data);
vi.mock('./state/webgl', () => webgl);
// The map's code: three.js and the canvas. Here a stand-in that says what it was given.
vi.mock('./MusicMap', () => ({ default: (props: { data: { n: number } }) => <div data-testid="map">{props.data.n} albums</div> }));

import { MapWhenLoaded, loadMapChunk, noNebula, openingStop, resetMapCode, useMapBoot, useMapCodeFailed, useMapShown } from './boot';
import { getMapReveal, resetMapReveal, setMapReveal } from './state/reveal';

describe('starting everything the map needs at once', () => {
  let frames: FrameRequestCallback[];
  let warm: () => void;
  let catalogIn: () => void;

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    early.startEarlyGas.mockClear();
    early.dropEarlyGas.mockClear();
    search.searchWanted.mockReset();
    search.searchWanted.mockReturnValue(false);
    data.peekCatalog.mockReset();
    data.peekCatalog.mockReturnValue(null);
    data.loadCatalog.mockReset();
    data.loadCatalog.mockImplementation(() => new Promise((resolve) => (catalogIn = () => resolve({}))));
    webgl.warmUpWebGL.mockReset();
    webgl.warmUpWebGL.mockImplementation(() => new Promise<void>((resolve) => (warm = resolve)));
    webgl.isWebGLAvailable.mockReset();
    useAppStore.setState({ webgl: 'unknown' });
    performance.clearMarks();
    resetMarks();
    resetMapCode();
    resetMapReveal();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const frame = () => frames.shift()!(performance.now());

  it('asks for nothing of the map before first paint: the page\'s scripts and the album list have the line', () => {
    const { result } = renderHook(() => useMapBoot());
    expect(result.current).toBe(false);
    expect(early.startEarlyGas).not.toHaveBeenCalled();
    expect(performance.getEntriesByName('rmr-chunk-start')).toHaveLength(0);
    expect(webgl.warmUpWebGL).not.toHaveBeenCalled();
    frame();
    expect(result.current).toBe(false);
    expect(early.startEarlyGas).not.toHaveBeenCalled();
  });

  it('after first paint (two frames) starts the nebula image, the map\'s code, the other data and the warm-up side by side: none waits for another, nor for the album list', async () => {
    const { result } = renderHook(() => useMapBoot());
    frame();
    act(() => frame());
    // All of it while the album list is still on its way, the warm-up has not answered and WebGL is not known to work.
    expect(early.startEarlyGas).toHaveBeenCalledTimes(1);
    expect(early.startEarlyGas).toHaveBeenCalledWith('balanced');
    expect(performance.getEntriesByName('rmr-chunk-start').length).toBeGreaterThan(0);
    expect(result.current, 'MapStage loads the positions and the theme from now').toBe(true);
    expect(webgl.warmUpWebGL).toHaveBeenCalledTimes(1);
    expect(webgl.isWebGLAvailable).not.toHaveBeenCalled();
    expect(data.loadCatalog).not.toHaveBeenCalled();
    expect(useAppStore.getState().webgl).toBe('unknown');
    // Only drawing waits for the probe.
    webgl.isWebGLAvailable.mockReturnValue(true);
    warm();
    await vi.waitFor(() => expect(useAppStore.getState().webgl).toBe('ok'));
    expect(early.dropEarlyGas).not.toHaveBeenCalled();
  });

  it('with a visitor at the search field, the map\'s downloads wait for the album list, which search needs; the warm-up does not', async () => {
    search.searchWanted.mockReturnValue(true);
    const { result } = renderHook(() => useMapBoot());
    frame();
    act(() => frame());
    expect(data.loadCatalog).toHaveBeenCalledTimes(1);
    expect(early.startEarlyGas).not.toHaveBeenCalled();
    expect(performance.getEntriesByName('rmr-chunk-start')).toHaveLength(0);
    expect(result.current).toBe(false);
    // (the warm-up is no download)
    expect(webgl.warmUpWebGL).toHaveBeenCalledTimes(1);
    await act(async () => {
      catalogIn();
      await Promise.resolve();
    });
    expect(early.startEarlyGas).toHaveBeenCalledTimes(1);
    expect(performance.getEntriesByName('rmr-chunk-start').length).toBeGreaterThan(0);
    expect(result.current).toBe(true);
  });

  it('a search field with the album list already in holds nothing back, and an album list that fails does not hold the map for good', async () => {
    search.searchWanted.mockReturnValue(true);
    data.peekCatalog.mockReturnValue({});
    const ready = renderHook(() => useMapBoot());
    frame();
    act(() => frame());
    expect(early.startEarlyGas).toHaveBeenCalledTimes(1);
    expect(ready.result.current).toBe(true);
    ready.unmount();
    early.startEarlyGas.mockClear();
    data.peekCatalog.mockReturnValue(null);
    data.loadCatalog.mockImplementation(() => Promise.reject(new Error('offline')));
    const failed = renderHook(() => useMapBoot());
    frame();
    await act(async () => {
      frame();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(early.startEarlyGas).toHaveBeenCalledTimes(1);
    expect(failed.result.current).toBe(true);
  });

  it('the page asks for the map\'s files from its script, never by a preload link in the HTML (they took bandwidth from the page\'s own scripts)', () => {
    expect(fs.existsSync('src/components/map/MapPreloads.tsx')).toBe(false);
    for (const f of ['src/app/layout.tsx', 'src/components/map/MapStage.tsx', 'src/components/map/boot.ts', 'src/lib/data/early.ts']) {
      expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/from 'react-dom'|\bpreload\(/);
    }
    // MapStage switches the positions and the theme on with the hook's result; the album list is never held back.
    const stage = fs.readFileSync('src/components/map/MapStage.tsx', 'utf8');
    expect(stage).toContain('const started = useMapBoot();');
    expect(stage).toContain('useCatalog();');
    expect(stage).toContain('usePositions(started);');
    expect(stage).toContain('useThemeLoad(started);');
  });

  it('without WebGL says so and frees the image no map will take', async () => {
    renderHook(() => useMapBoot());
    frame();
    act(() => frame());
    webgl.isWebGLAvailable.mockReturnValue(false);
    warm();
    await vi.waitFor(() => expect(useAppStore.getState().webgl).toBe('unavailable'));
    expect(early.dropEarlyGas).toHaveBeenCalledTimes(1);
  });

  it('an unmount before the warm-up ends leaves the store alone', async () => {
    const { unmount } = renderHook(() => useMapBoot());
    frame();
    act(() => frame());
    const signal = (webgl.warmUpWebGL.mock.calls[0][0] as { signal: AbortSignal }).signal;
    unmount();
    expect(signal.aborted).toBe(true);
    webgl.isWebGLAvailable.mockReturnValue(true);
    warm();
    await Promise.resolve();
    await Promise.resolve();
    expect(useAppStore.getState().webgl).toBe('unknown');
  });

  it('renders the map in the commit its code arrives in, with no Suspense boundary to hold it back', async () => {
    const props = { data: { n: 7 } } as unknown as MusicMapProps;
    const failed: boolean[] = [];
    function Probe() {
      failed.push(useMapCodeFailed());
      return <MapWhenLoaded {...props} />;
    }
    const { queryByTestId } = render(<Probe />);
    // nothing before the code is in, and no fallback either
    expect(queryByTestId('map')).toBeNull();
    await act(() => loadMapChunk());
    expect(queryByTestId('map')!.textContent).toBe('7 albums');
    expect(failed.every((f) => !f)).toBe(true);
    // asked for once, however often it is called
    await act(() => loadMapChunk());
    expect(performance.getEntriesByName('rmr-chunk-start')).toHaveLength(1);
    // React shows a lazy component 300 ms after its fallback: the map's code is not loaded that way.
    const source = fs.readFileSync('src/components/map/MapStage.tsx', 'utf8') + fs.readFileSync('src/components/map/boot.ts', 'utf8');
    expect(source).not.toMatch(/from 'next\/dynamic'|\blazy\(|<Suspense/);
  });

  it('with no usable theme: the stand-in is told to go, and the image asked for early is freed (no gas layer will take it)', () => {
    window.__rmr = { ...window.__rmr, gas: 'loading' } as typeof window.__rmr;
    noNebula();
    expect(getMapReveal()).toBe('sky');
    expect(early.dropEarlyGas).toHaveBeenCalledTimes(1);
    // freed whatever the theme names: called with no list of images to keep
    expect(early.dropEarlyGas).toHaveBeenCalledWith();
    expect(window.__rmr!.gas).toBe('off');
    // MapStage calls it from the effect that sees the theme fail or not fit
    const stage = fs.readFileSync('src/components/map/MapStage.tsx', 'utf8');
    expect(stage).toMatch(/if \(themeStatus === 'error' \|\| \(mapData !== null && loadedTheme !== null && theme === null\)\) noNebula\(\);/);
  });

  it('the controls that stand on the map come in with the canvas, not before it', () => {
    const { result } = renderHook(() => useMapShown());
    expect(result.current).toBe(false);
    act(() => setMapReveal('stars'));
    expect(result.current).toBe(true);
    act(() => setMapReveal('gas'));
    expect(result.current).toBe(true);
    const stage = fs.readFileSync('src/components/map/MapStage.tsx', 'utf8');
    expect(stage).toContain("data-shown={shown || off ? '1' : '0'}");
    const css = fs.readFileSync('src/styles/map.css', 'utf8');
    expect(css).toContain('.map-pane[data-shown="0"] .map-zoom { opacity: 0; visibility: hidden; }');
    // and they fade as the canvas does
    expect(css).toMatch(/\.map-zoom \{[^}]*transition: opacity \.2s var\(--out\), visibility 0s;/);
  });

  it('the hint line is not one of them: it is rendered before any data, for the first paint, unless no map is coming', () => {
    const stage = fs.readFileSync('src/components/map/MapStage.tsx', 'utf8');
    expect(stage).toContain("{webgl !== 'unavailable' && !failed && (view === 'explore' || view === 'album') ? <MapHint hidden={view === 'album' || selected !== null} /> : null}");
    // Nothing hides it while the stand-in is up; only its band's top edge is eased in by a mask until the map shows.
    const css = fs.readFileSync('src/styles/map.css', 'utf8');
    expect(css).toContain('.map-pane[data-shown="0"] .map-hint { -webkit-mask-position: 0 0; mask-position: 0 0; }');
    expect(css).not.toMatch(/data-shown="0"\] \.map-hint[^{]*\{[^}]*(opacity|visibility|display)/);
    // At rest the mask lies wholly above the band (44 px, the band's own ramp and the text's top padding).
    expect(css).toMatch(/\.map-hint \{[^}]*padding: 44px [^}]*mask: linear-gradient\(transparent, [^;]*#000 44px\) 0 -44px \/ 100% calc\(100% \+ 44px\) no-repeat;/);
  });

  it('the stand-in is off behind the no-WebGL message and behind the error panel', () => {
    const stage = fs.readFileSync('src/components/map/MapStage.tsx', 'utf8');
    expect(stage).toContain("const off = webgl === 'unavailable' || failed;");
    expect(stage).toContain('<GasPlaceholder view={view} off={off} />');
    expect(stage).toMatch(/const failed = webgl !== 'unavailable' && \(catalogStatus === 'error' \|\| positionsStatus === 'error' \|\| codeFailed\);/);
  });

  it('opens on the stop an album link names, and on the default everywhere else', () => {
    expect(openingStop('/', '')).toBe('balanced');
    expect(openingStop('/map', '?by=mood')).toBe('balanced');
    expect(openingStop('/album/in-rainbows-radiohead', '')).toBe('balanced');
    expect(openingStop('/album/in-rainbows-radiohead', '?by=mood')).toBe('mood');
    expect(openingStop('/album/in-rainbows-radiohead', '?by=sound')).toBe('sonic');
    expect(openingStop('/album/in-rainbows-radiohead', '?by=nonsense')).toBe('balanced');
  });
});
