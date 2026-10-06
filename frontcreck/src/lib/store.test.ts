import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './store';

const initial = useAppStore.getState();

beforeEach(() => {
  window.sessionStorage.clear();
  useAppStore.setState(initial, true);
});

afterEach(() => vi.restoreAllMocks());

function countNotifications(run: () => void): number {
  let calls = 0;
  const unsub = useAppStore.subscribe(() => calls++);
  run();
  unsub();
  return calls;
}

describe('app store', () => {
  it('defaults to the balanced stop and an empty session', () => {
    const s = useAppStore.getState();
    expect(s.stop).toBe('balanced');
    expect(s.focus).toBeNull();
    expect(s.hot).toBeNull();
    expect(s.trail).toEqual([]);
    expect(s.webgl).toBe('unknown');
  });

  it('does not notify subscribers for no-op updates', () => {
    let calls = 0;
    const unsub = useAppStore.subscribe(() => calls++);
    useAppStore.getState().setStop('balanced');
    useAppStore.getState().setFocus({ seed: 1, recs: [2, 3] });
    useAppStore.getState().setFocus({ seed: 1, recs: [2, 3] });
    useAppStore.getState().setHot(null);
    unsub();
    expect(calls).toBe(1);
  });

  it('records visits in the trail and sessionStorage', () => {
    const { visit } = useAppStore.getState();
    visit({ slug: 'a', title: 'A' });
    visit({ slug: 'b', title: 'B' });
    visit({ slug: 'a', title: 'A' });
    expect(useAppStore.getState().trail.map((t) => t.slug)).toEqual(['a']);
    expect(JSON.parse(window.sessionStorage.getItem('rmr-trail') ?? '[]')).toHaveLength(1);
  });

  it('does not notify or write again when the album is already last on the trail', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const calls = countNotifications(() => {
      useAppStore.getState().visit({ slug: 'a', title: 'A' });
      useAppStore.getState().visit({ slug: 'a', title: 'A' });
    });
    expect(calls).toBe(1);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().trail.map((t) => t.slug)).toEqual(['a']);
  });

  it('writes the trail outside the state updater', () => {
    let trailWhenWritten: string[] | null = null;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      trailWhenWritten = useAppStore.getState().trail.map((t) => t.slug);
    });
    useAppStore.getState().visit({ slug: 'a', title: 'A' });
    expect(trailWhenWritten).toEqual(['a']);
  });

  it('keeps the trail in memory when sessionStorage throws', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);
    useAppStore.getState().visit({ slug: 'a', title: 'A' });
    useAppStore.getState().visit({ slug: 'b', title: 'B' });
    expect(useAppStore.getState().trail.map((t) => t.slug)).toEqual(['a', 'b']);
  });

  it('does not notify when the saved explore camera is unchanged', () => {
    const calls = countNotifications(() => {
      useAppStore.getState().saveExploreCamera({ x: 1, y: 2, zoom: 3 });
      useAppStore.getState().saveExploreCamera({ x: 1, y: 2, zoom: 3 });
      useAppStore.getState().saveExploreCamera(null);
      useAppStore.getState().saveExploreCamera(null);
    });
    expect(calls).toBe(2);
  });

  it('restores the trail from sessionStorage on the first visit of a page load', () => {
    window.sessionStorage.setItem('rmr-trail', JSON.stringify([{ slug: 'x', title: 'X' }]));
    useAppStore.getState().visit({ slug: 'y', title: 'Y' });
    expect(useAppStore.getState().trail.map((t) => t.slug)).toEqual(['x', 'y']);
  });

  it('gives each toast a new id', () => {
    useAppStore.getState().showToast('Link copied');
    const first = useAppStore.getState().toast!.id;
    useAppStore.getState().showToast('Link copied');
    expect(useAppStore.getState().toast!.id).toBeGreaterThan(first);
    useAppStore.getState().clearToast();
    expect(useAppStore.getState().toast).toBeNull();
  });

  it('exposes getState for end-to-end tests', () => {
    expect(window.__rmr?.getState().stop).toBe('balanced');
  });

  it('shows region names by default, and saves the choice when it changes', () => {
    window.localStorage.clear();
    expect(useAppStore.getState().namesOn).toBe(true);
    const calls = countNotifications(() => {
      useAppStore.getState().setNamesOn(true);
      useAppStore.getState().setNamesOn(false);
      useAppStore.getState().setNamesOn(false);
    });
    expect(calls).toBe(1);
    expect(useAppStore.getState().namesOn).toBe(false);
    expect(window.localStorage.getItem('rmr-names')).toBe('0');
  });

  it('still switches names off for the page load when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    useAppStore.getState().setNamesOn(false);
    expect(useAppStore.getState().namesOn).toBe(false);
  });

  it('starts from the saved choice in the browser', async () => {
    window.localStorage.setItem('rmr-names', '0');
    vi.resetModules();
    const fresh = await import('./store');
    expect(fresh.useAppStore.getState().namesOn).toBe(false);
    window.localStorage.clear();
  });
});
