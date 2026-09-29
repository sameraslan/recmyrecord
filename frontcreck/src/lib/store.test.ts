import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';

const initial = useAppStore.getState();

beforeEach(() => {
  window.sessionStorage.clear();
  useAppStore.setState(initial, true);
});

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
});
