import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMarks } from '@/lib/marks';
import { useAppStore } from '@/lib/store';
import type { MusicMapProps } from './types';

const early = vi.hoisted(() => ({ startEarlyGas: vi.fn(), dropEarlyGas: vi.fn() }));
const webgl = vi.hoisted(() => ({ warmUpWebGL: vi.fn(), isWebGLAvailable: vi.fn() }));
vi.mock('@/lib/data/early', () => early);
vi.mock('./state/webgl', () => webgl);
// The map's code: three.js and the canvas. Here a stand-in that says what it was given.
vi.mock('./MusicMap', () => ({ default: (props: { data: { n: number } }) => <div data-testid="map">{props.data.n} albums</div> }));

import { MapWhenLoaded, loadMapChunk, openingStop, resetMapCode, useMapBoot, useMapCodeFailed } from './boot';

describe('starting everything the map needs at once', () => {
  let frames: FrameRequestCallback[];
  let warm: () => void;

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    early.startEarlyGas.mockClear();
    early.dropEarlyGas.mockClear();
    webgl.warmUpWebGL.mockReset();
    webgl.warmUpWebGL.mockImplementation(() => new Promise<void>((resolve) => (warm = resolve)));
    webgl.isWebGLAvailable.mockReset();
    useAppStore.setState({ webgl: 'unknown' });
    performance.clearMarks();
    resetMarks();
    resetMapCode();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const frame = () => frames.shift()!(performance.now());

  it('asks for the nebula image in the first effect, before first paint, the WebGL warm-up and the probe', () => {
    renderHook(() => useMapBoot());
    expect(early.startEarlyGas).toHaveBeenCalledTimes(1);
    expect(early.startEarlyGas).toHaveBeenCalledWith('balanced');
    expect(webgl.warmUpWebGL).not.toHaveBeenCalled();
    expect(useAppStore.getState().webgl).toBe('unknown');
  });

  it('after first paint (two frames) asks for the map\'s code and starts the warm-up side by side: neither waits for the other, nor for data', async () => {
    renderHook(() => useMapBoot());
    frame();
    expect(webgl.warmUpWebGL).not.toHaveBeenCalled();
    expect(performance.getEntriesByName('rmr-chunk-start')).toHaveLength(0);
    frame();
    // The code is asked for while the warm-up has not answered and WebGL is not known to work.
    expect(performance.getEntriesByName('rmr-chunk-start').length).toBeGreaterThan(0);
    expect(webgl.warmUpWebGL).toHaveBeenCalledTimes(1);
    expect(webgl.isWebGLAvailable).not.toHaveBeenCalled();
    expect(useAppStore.getState().webgl).toBe('unknown');
    // Only drawing waits for the probe.
    webgl.isWebGLAvailable.mockReturnValue(true);
    warm();
    await vi.waitFor(() => expect(useAppStore.getState().webgl).toBe('ok'));
    expect(early.dropEarlyGas).not.toHaveBeenCalled();
  });

  it('without WebGL says so and frees the image no map will take', async () => {
    renderHook(() => useMapBoot());
    frame();
    frame();
    webgl.isWebGLAvailable.mockReturnValue(false);
    warm();
    await vi.waitFor(() => expect(useAppStore.getState().webgl).toBe('unavailable'));
    expect(early.dropEarlyGas).toHaveBeenCalledTimes(1);
  });

  it('an unmount before the warm-up ends leaves the store alone', async () => {
    const { unmount } = renderHook(() => useMapBoot());
    frame();
    frame();
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
    const source = await import('node:fs').then((fs) => fs.readFileSync('src/components/map/MapStage.tsx', 'utf8') + fs.readFileSync('src/components/map/boot.ts', 'utf8'));
    expect(source).not.toMatch(/from 'next\/dynamic'|\blazy\(|<Suspense/);
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
