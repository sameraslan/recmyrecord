import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AlbumRecord } from '@/lib/types';
import { useMapStore } from '../state/mapStore';
import { HoverLabel, WARM_MIN_IDLE_MS, warmLabelFonts } from './HoverLabel';

const W: [string, string, string] = ['#222222', '#333333', '#d9a066'];
const albums: AlbumRecord[] = ['Alpha', 'Beta'].map((t, i) => ({ slug: t.toLowerCase(), t, a: 'Someone', s: '', c: '', k: i, d: [], w: W }));

type Idle = (d: IdleDeadline) => void;
/** The browser's idle queue, run by hand: `run(ms)` gives the oldest waiting callback an idle period of ms. */
function idleQueue() {
  const waiting = new Map<number, Idle>();
  let next = 1;
  const request = vi.fn((fn: Idle) => {
    waiting.set(next, fn);
    return next++;
  });
  const cancel = vi.fn((id: number) => void waiting.delete(id));
  vi.stubGlobal('requestIdleCallback', request);
  vi.stubGlobal('cancelIdleCallback', cancel);
  return {
    request,
    cancel,
    size: () => waiting.size,
    run(ms: number) {
      const [id, fn] = [...waiting][0];
      waiting.delete(id);
      fn({ didTimeout: false, timeRemaining: () => ms });
    },
  };
}

/** What was in the document each time a width was read (the read is what makes the browser lay the text out). */
function layoutReads(): { cls: string; line: string; text: string; hidden: boolean; inDocument: boolean }[] {
  const reads: { cls: string; line: string; text: string; hidden: boolean; inDocument: boolean }[] = [];
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    reads.push({ cls: this.className, line: this.firstElementChild?.className ?? '', text: this.textContent ?? '', hidden: this.style.visibility === 'hidden', inDocument: this.isConnected });
    return 0;
  });
  return reads;
}

let tip: HTMLElement;
beforeEach(() => {
  tip = document.createElement('div');
  tip.className = 'map-tip';
  document.body.append(tip);
});
afterEach(() => {
  cleanup();
  tip.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useMapStore.setState({ hoveredIndex: null });
});

describe('warmLabelFonts', () => {
  it('lays out nothing when called: it only asks for an idle moment', () => {
    const idle = idleQueue();
    const reads = layoutReads();
    warmLabelFonts(tip);
    expect(idle.request).toHaveBeenCalledTimes(1);
    expect(reads).toEqual([]);
    expect(document.querySelectorAll('.map-tip')).toHaveLength(1);
  });

  it('lays out a hidden label line of kana, han and hangul per idle moment, title first, and leaves nothing behind', () => {
    const idle = idleQueue();
    const reads = layoutReads();
    warmLabelFonts(tip);
    idle.run(50);
    expect(reads).toHaveLength(1);
    idle.run(50);
    expect(reads).toHaveLength(2);
    // The label's own classes, so the stylesheet gives the lines the fonts the real label uses.
    expect(reads.map((r) => [r.cls, r.line])).toEqual([['map-tip', 't'], ['map-tip', 'a']]);
    for (const r of reads) {
      expect(r.text).toMatch(/[぀-ヿ]/);
      expect(r.text).toMatch(/[一-鿿]/);
      expect(r.text).toMatch(/[가-힯]/);
      expect(r.hidden).toBe(true);
      expect(r.inDocument).toBe(true);
    }
    // Done: nothing more is asked for, the real label was never touched and no node stays in the page.
    expect(idle.size()).toBe(0);
    expect(idle.request).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('.map-tip')).toHaveLength(1);
    expect(tip.childNodes).toHaveLength(0);
    expect(tip.getAttribute('style')).toBeNull();
  });

  it('waits while frames are being drawn: an idle period shorter than WARM_MIN_IDLE_MS does no layout and asks again', () => {
    const idle = idleQueue();
    const reads = layoutReads();
    warmLabelFonts(tip);
    for (let i = 0; i < 5; i++) idle.run(WARM_MIN_IDLE_MS - 1);
    expect(reads).toEqual([]);
    expect(idle.size()).toBe(1);
    // A frame is 16.7 ms at 60 Hz: an idle period between two frames can never reach the threshold.
    expect(WARM_MIN_IDLE_MS).toBeGreaterThan(17);
    idle.run(WARM_MIN_IDLE_MS);
    expect(reads).toHaveLength(1);
  });

  it('stops when told to, and does nothing where there are no idle callbacks', () => {
    const idle = idleQueue();
    const reads = layoutReads();
    const stop = warmLabelFonts(tip);
    stop();
    expect(idle.size()).toBe(0);
    vi.unstubAllGlobals();
    vi.stubGlobal('requestIdleCallback', undefined);
    expect(() => warmLabelFonts(tip)()).not.toThrow();
    expect(reads).toEqual([]);
  });
});

describe('HoverLabel', () => {
  it('warms the fonts once when it mounts, never when the hovered album changes, and cancels on unmount', () => {
    const idle = idleQueue();
    const { unmount } = render(<HoverLabel albums={albums} />);
    expect(idle.request).toHaveBeenCalledTimes(1);
    useMapStore.setState({ hoveredIndex: 1 });
    useMapStore.setState({ hoveredIndex: 0 });
    useMapStore.setState({ hoveredIndex: null });
    expect(idle.request).toHaveBeenCalledTimes(1);
    unmount();
    expect(idle.size()).toBe(0);
  });
});
