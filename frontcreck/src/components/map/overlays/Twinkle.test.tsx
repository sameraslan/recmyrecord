import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getOverlayEl } from '../state/overlayEls';
import type { Glint } from '../state/twinkle';
import { TWINKLE_GLASS, TwinkleLayer, addGlint, glassRects } from './Twinkle';

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

/** jsdom lays nothing out: each element answers with the box the test gives it. */
function boxed<T extends Element>(el: T, left: number, top: number, width: number, height: number): T {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
  return el;
}

describe('the glass surfaces a glint keeps clear of (glassRects)', () => {
  function page(): { root: HTMLElement; layer: HTMLElement } {
    const root = document.createElement('div');
    root.innerHTML = `
      <header class="top"></header>
      <aside class="album"></aside>
      <div class="map-pane">
        <div class="tw-layer"></div>
        <div class="mode panel"></div>
        <div class="card panel"></div>
        <div class="map-zoom"><button id="in"></button><button id="out"></button></div>
        <div class="map-msg"></div>
        <p class="map-hint"></p>
        <div class="map-tip"></div>
      </div>`;
    // The layer (and the canvas under it) starts at the top of the window, 0 px in; the pane is 1280 x 720.
    const layer = boxed(root.querySelector<HTMLElement>('.tw-layer')!, 0, 0, 1280, 720);
    boxed(root.querySelector('.top')!, 0, 0, 1280, 64);
    boxed(root.querySelector('.album')!, 0, 64, 420, 656);
    boxed(root.querySelector('.mode')!, 440, 84, 244, 130);
    boxed(root.querySelector('.card')!, 0, 0, 0, 0); // not laid out (display: none)
    boxed(root.querySelector('#in')!, 1220, 580, 40, 40);
    boxed(root.querySelector('#out')!, 1220, 620, 40, 40);
    boxed(root.querySelector('.map-msg')!, 2000, 100, 300, 100); // off the pane altogether
    boxed(root.querySelector('.map-hint')!, 420, 640, 860, 80);
    boxed(root.querySelector('.map-tip')!, 600, 300, 200, 60);
    return { root, layer };
  }

  it('lists every glass surface that lies over the map, and nothing that is not glass', () => {
    const { root, layer } = page();
    expect(glassRects(layer, root)).toEqual([
      { left: 0, top: 0, right: 1280, bottom: 64 },
      { left: 0, top: 64, right: 420, bottom: 720 },
      { left: 440, top: 84, right: 684, bottom: 214 },
      { left: 1220, top: 580, right: 1260, bottom: 620 },
      { left: 1220, top: 620, right: 1260, bottom: 660 },
    ]);
  });

  it('gives them in the layer\'s own coordinates, wherever the layer is in the window', () => {
    const { root, layer } = page();
    boxed(layer, 100, 30, 1280, 720);
    const rects = glassRects(layer, root);
    expect(rects[0]).toEqual({ left: -100, top: -30, right: 1180, bottom: 34 });
    expect(rects).toHaveLength(5);
  });

  it('names exactly the surfaces the stylesheet makes glass (styles/shell.css): a new one there must be added here', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/shell.css'), 'utf8');
    const rule = css.split('\n').find((line, i, all) => /^\./.test(line) && line.trimEnd().endsWith('{') && (all[i + 1] ?? '').includes('backdrop-filter: var(--glass-blur)'));
    expect(rule).toBeDefined();
    const inCss = rule!.replace(/\s*\{\s*$/, '').split(',').map((sel) => sel.trim()).sort();
    expect(TWINKLE_GLASS.split(',').map((sel) => sel.trim()).sort()).toEqual(inCss);
    // And no other rule in the app's styles turns a blur of the backdrop on.
    const dir = path.join(process.cwd(), 'src/styles');
    const others = fs.readdirSync(dir).filter((f) => f.endsWith('.css')).flatMap((f) =>
      [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/backdrop-filter:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((value) => value !== 'none' && value !== 'var(--glass-blur)').map((value) => `${f}: ${value}`),
    );
    expect(others).toEqual([]);
  });
});
