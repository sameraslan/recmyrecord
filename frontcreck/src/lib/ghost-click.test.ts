import { afterEach, describe, expect, it, vi } from 'vitest';
import { suppressGhostClick } from './ghost-click';

function click(x: number, y: number): boolean {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
  document.body.dispatchEvent(e);
  return e.defaultPrevented;
}

afterEach(() => vi.restoreAllMocks());

describe('suppressGhostClick', () => {
  it('swallows the compatibility click at the same spot, once', () => {
    suppressGhostClick(100, 200);
    expect(click(104, 197)).toBe(true);
    expect(click(104, 197)).toBe(false);
  });

  it('lets clicks elsewhere through', () => {
    suppressGhostClick(100, 200);
    expect(click(300, 200)).toBe(false);
  });

  it('disarms on the next pointerdown so a real second tap works', () => {
    suppressGhostClick(100, 200);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(click(100, 200)).toBe(false);
  });

  it('expires after 700 ms', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    suppressGhostClick(100, 200);
    now.mockReturnValue(1800);
    expect(click(100, 200)).toBe(false);
  });

  it('keeps the compatibility mousedown at the same spot from moving focus, and does not disarm on it', () => {
    suppressGhostClick(100, 200);
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 102, clientY: 201 });
    document.body.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(click(102, 201)).toBe(true);
    const away = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 });
    suppressGhostClick(100, 200);
    document.body.dispatchEvent(away);
    expect(away.defaultPrevented).toBe(false);
  });
});
