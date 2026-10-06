import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getOverlayEl } from '../state/overlayEls';
import type { Glint } from '../state/twinkle';
import { TwinkleLayer, addGlint } from './Twinkle';

const GLINT: Glint = { index: 42, x: 100, y: 50, radius: 20, flare: 67.2, rgb: [255, 254, 252], peak: 1, durMs: 1500 };
const numbers = (text: string): number[] => (text.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('TwinkleLayer', () => {
  it('is an empty decorative layer that registers itself for the driver and leaves when unmounted', () => {
    const { container, unmount } = render(<TwinkleLayer />);
    const layer = container.querySelector('.tw-layer')!;
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer.childElementCount).toBe(0);
    expect(getOverlayEl('twinkle')).toBe(layer);
    unmount();
    expect(getOverlayEl('twinkle')).toBeNull();
  });
});

describe('addGlint', () => {
  it('adds two nodes centred on the star and named after its album, with nothing to focus, click or read', () => {
    const layer = document.createElement('div');
    const handle = addGlint(layer, GLINT, () => {});
    expect(layer.querySelectorAll('*')).toHaveLength(2);
    const el = layer.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('I');
    expect(el.className).toBe('tw');
    expect(el.dataset.album).toBe('42');
    // Top left corner at the star minus the radius, so the box (two radii wide) is centred on the star.
    expect(numbers(el.style.transform)).toEqual([80, 30]);
    expect(parseFloat(el.style.width)).toBe(40);
    expect(parseFloat(el.style.height)).toBe(40);
    const dot = el.firstElementChild as HTMLElement;
    expect(dot.tagName).toBe('B');
    expect(dot.className).toBe('tw-flare');
    expect(dot.style.getPropertyValue('--fl')).toBe('67.2px');
    expect(dot.style.getPropertyValue('--peak')).toBe('1.00');
    expect(dot.style.animationDuration).toBe('1500ms');
    expect(layer.querySelectorAll('a, button, input, [tabindex], [role], [title]')).toHaveLength(0);
    expect(layer.textContent).toBe('');
    expect(handle.durMs).toBe(1500);
  });

  it('has no flare on the two fainter classes, and a quieter peak beside an open album', () => {
    const layer = document.createElement('div');
    addGlint(layer, { ...GLINT, flare: null, peak: 0.6 }, () => {});
    const dot = layer.querySelector('b') as HTMLElement;
    expect(dot.className).toBe('');
    expect(dot.style.getPropertyValue('--fl')).toBe('');
    expect(dot.style.getPropertyValue('--peak')).toBe('0.60');
  });

  it('reports the end of its animation, and remove takes it out (twice is harmless)', () => {
    const layer = document.createElement('div');
    const ended = vi.fn();
    const handle = addGlint(layer, GLINT, ended);
    layer.querySelector('b')!.dispatchEvent(new Event('animationend'));
    expect(ended).toHaveBeenCalledTimes(1);
    handle.remove();
    expect(layer.childElementCount).toBe(0);
    expect(() => handle.remove()).not.toThrow();
  });
});

describe('the glint styles (styles/map.css)', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/map.css'), 'utf8');
  const rules = css.split('\n').filter((line) => /^\.tw|^@keyframes tw-glint/.test(line));

  it('animate opacity and transform only, and take no pointer events', () => {
    const keyframes = rules.find((r) => r.startsWith('@keyframes tw-glint'))!;
    const animated = new Set([...keyframes.matchAll(/([a-z-]+):/g)].map((m) => m[1]));
    expect([...animated].sort()).toEqual(['opacity', 'transform']);
    expect(rules.find((r) => r.startsWith('.tw-layer {'))).toContain('pointer-events: none');
    expect(rules.find((r) => r.startsWith('.tw {'))).toContain('pointer-events: none');
  });
});
