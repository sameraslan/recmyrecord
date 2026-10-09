import fs from 'node:fs';
import path from 'node:path';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAS_PLACEHOLDER_BALANCED, THEME_BAKE } from '@/lib/data/theme.generated';
import { DEFAULT_STOP } from '@/lib/types';
import { DESKTOP_FIT_PADDING, PHONE_FIT_PADDING, PHONE_SLIDER_COVER_FALLBACK_PX } from '../framing';
import { OVERVIEW_COVER_MAX_PX, OVERVIEW_NARROW_CLOSER, OVERVIEW_NARROW_COVER_PX, OVERVIEW_SIDE_PAD_PX } from '../state/bounds';
import { MAP_REVEAL_FADE_MS, resetMapReveal, setMapReveal } from '../state/reveal';
import { COVER_WORLD } from '../state/zoomLimits';
import { GasPlaceholder, OVER, placeholderLayout } from './GasPlaceholder';

const css = fs.readFileSync(path.join(process.cwd(), 'src/styles/map.css'), 'utf8');
const B = THEME_BAKE.stops.balanced;

describe('the stand-in nebula of the first paint', () => {
  beforeEach(() => {
    resetMapReveal();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('repeats the Overview\'s constants exactly (state/bounds.ts belongs to the map\'s chunk)', () => {
    expect(OVER).toEqual({ sidePad: OVERVIEW_SIDE_PAD_PX, narrowCloser: OVERVIEW_NARROW_CLOSER, coverMaxPx: OVERVIEW_COVER_MAX_PX, narrowCoverPx: OVERVIEW_NARROW_COVER_PX, coverWorld: COVER_WORLD });
  });

  it('Home, About and 404: the cloud\'s extent as the viewBox, fitted into the area the Whole map is fitted into', () => {
    for (const view of ['home', 'about', 'other'] as const) {
      const l = placeholderLayout(view);
      expect(l.kind).toBe('fit');
      const [x, y, w, h] = l.viewBox!.split(' ').map(Number);
      // <svg> units are thousandths of a world unit, y down
      expect(x).toBeCloseTo(B.cloud[0] * 1000, 1);
      expect(y).toBeCloseTo(-B.cloud[3] * 1000, 1);
      expect(w).toBeCloseTo((B.cloud[2] - B.cloud[0]) * 1000, 1);
      expect(h).toBeCloseTo((B.cloud[3] - B.cloud[1]) * 1000, 1);
      // the map's own fit paddings, desktop and phone
      expect(l.vars).toMatchObject({ '--l': `${DESKTOP_FIT_PADDING.left}px`, '--r': `${DESKTOP_FIT_PADDING.right}px`, '--t': `${DESKTOP_FIT_PADDING.top}px`, '--b': `${DESKTOP_FIT_PADDING.bottom}px` });
      expect(l.vars).toMatchObject({ '--nl': `${PHONE_FIT_PADDING.left}px`, '--nr': `${PHONE_FIT_PADDING.right}px`, '--nt': `${PHONE_FIT_PADDING.top}px`, '--nb': `${PHONE_FIT_PADDING.bottom}px` });
    }
  });

  it('/map: the 1st to 99th percentile span as the viewBox, one unit tall about the median row, so it fits by width', () => {
    const l = placeholderLayout('explore');
    expect(l.kind).toBe('over');
    const [x, y, w, h] = l.viewBox!.split(' ').map(Number);
    expect(x).toBeCloseTo(B.span[0] * 1000, 1);
    expect(w).toBeCloseTo((B.span[1] - B.span[0]) * 1000, 1);
    expect(h).toBe(1);
    expect(y + h / 2).toBeCloseTo(-B.span[2] * 1000, 1);
    expect(l.vars['--pad']).toBe('24px');
    expect(l.vars['--closer']).toBe('1.8');
    expect(l.vars['--cover']).toBe(`${PHONE_SLIDER_COVER_FALLBACK_PX}px`);
    // The widths the span has on screen at the Overview's two zoom caps (covers of 12.5 px, and of 5.2 px on a phone).
    const span = B.span[1] - B.span[0];
    expect(parseFloat(l.vars['--max'])).toBeCloseTo((12.5 / COVER_WORLD) * span, 0);
    expect(parseFloat(l.vars['--nmax'])).toBeCloseTo((5.2 / COVER_WORLD) * span, 0);
  });

  it('ships the default stop\'s picture, the one every page is served for', () => {
    // The component imports GAS_PLACEHOLDER_BALANCED by name, so the other two stops' pictures stay out of the page's code.
    expect(DEFAULT_STOP).toBe('balanced');
    expect(fs.readFileSync(path.join(process.cwd(), 'src/components/map/overlays/GasPlaceholder.tsx'), 'utf8')).not.toMatch(/GAS_PLACEHOLDER_(SONIC|MOOD)/);
  });

  it('hangs the picture at the gas image\'s own rectangle, north up', () => {
    const { image } = placeholderLayout('home');
    expect(image.x).toBeCloseTo(B.gas[0] * 1000, 1);
    expect(image.y).toBeCloseTo(-B.gas[3] * 1000, 1);
    expect(image.width).toBeCloseTo((B.gas[2] - B.gas[0]) * 1000, 1);
    expect(image.height).toBeCloseTo((B.gas[3] - B.gas[1]) * 1000, 1);
  });

  it('renders the picture inline for Home and /map, and no picture, only a glow, for an album', () => {
    for (const [view, kind] of [['home', 'fit'], ['explore', 'over']] as const) {
      const { container, unmount } = render(<GasPlaceholder view={view} off={false} />);
      const el = container.querySelector('.gas-ph')!;
      expect(el.className).toBe(`gas-ph gas-ph--${kind}`);
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.querySelector('svg')!.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
      const image = el.querySelector('image')!;
      expect(image.getAttribute('href')).toBe(GAS_PLACEHOLDER_BALANCED);
      // stretched to its rectangle (the image's own shape is that rectangle's, to a texel)
      expect(image.getAttribute('preserveAspectRatio')).toBe('none');
      // The picture alone: no filter and no mask to paint (it is blurred and faded to the pane's colour when it is
      // baked, scripts/theme/build-module.mjs).
      expect(el.querySelector('filter, mask, radialGradient')).toBeNull();
      expect(image.getAttribute('filter')).toBeNull();
      expect(el.querySelectorAll('svg *')).toHaveLength(1);
      unmount();
    }
    const { container } = render(<GasPlaceholder view="album" off={false} />);
    const glow = container.querySelector('.gas-ph')!;
    expect(glow.className).toBe('gas-ph gas-ph--glow');
    expect(glow.querySelector('svg')).toBeNull();
    // a wash in the nebula's own two tones, not an invented colour
    expect((glow as HTMLElement).style.getPropertyValue('--warm')).toBe(B.warm.join(' '));
    expect((glow as HTMLElement).style.getPropertyValue('--cool')).toBe(B.cool.join(' '));
    expect(css).toMatch(/\.gas-ph \{ --glow: radial-gradient\([^;]*rgb\(var\(--warm\) \/ [^;]*radial-gradient\([^;]*rgb\(var\(--cool\) \/ /);
    expect(css).toContain('.gas-ph--glow { background: var(--glow); }');
  });

  it('stays while the map shows nothing or only its stars, and is taken out once the nebula has been drawn over it', () => {
    const { container } = render(<GasPlaceholder view="explore" off={false} />);
    act(() => setMapReveal('stars'));
    act(() => void vi.advanceTimersByTime(5000));
    expect(container.querySelector('.gas-ph')).not.toBeNull();
    act(() => setMapReveal('gas'));
    // covered by the canvas, which is fading in: still there, and not fading itself (a fade would dip to black)
    expect(container.querySelector('.gas-ph')!.className).not.toContain('is-leaving');
    act(() => void vi.advanceTimersByTime(MAP_REVEAL_FADE_MS - 1));
    expect(container.querySelector('.gas-ph')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(container.querySelector('.gas-ph')).toBeNull();
  });

  it('fades out and goes when no nebula will come, and when there is no WebGL', () => {
    const sky = render(<GasPlaceholder view="home" off={false} />);
    act(() => setMapReveal('sky'));
    expect(sky.container.querySelector('.gas-ph')!.className).toContain('is-leaving');
    act(() => void vi.advanceTimersByTime(MAP_REVEAL_FADE_MS + 200));
    expect(sky.container.querySelector('.gas-ph')).toBeNull();
    sky.unmount();
    resetMapReveal();
    const none = render(<GasPlaceholder view="home" off={false} />);
    none.rerender(<GasPlaceholder view="home" off />);
    expect(none.container.querySelector('.gas-ph')!.className).toContain('is-leaving');
    act(() => void vi.advanceTimersByTime(MAP_REVEAL_FADE_MS + 200));
    expect(none.container.querySelector('.gas-ph')).toBeNull();
    // and it does not come back
    none.rerender(<GasPlaceholder view="explore" off />);
    expect(none.container.querySelector('.gas-ph')).toBeNull();
  });

  it('is placed and faded by the stylesheet alone: no layout of its own, no pointer input, opacity only', () => {
    const rule = (selector: string): string => {
      const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css);
      if (!m) throw new Error(`no rule ${selector}`);
      return m[1];
    };
    const base = rule('.gas-ph');
    expect(base).toContain('position: absolute');
    expect(base).toContain('inset: 0');
    expect(base).toContain('pointer-events: none');
    expect(base).toContain('transition: opacity');
    expect(rule('.gas-ph.is-leaving').trim()).toBe('opacity: 0;');
    // the fits read the component's numbers
    for (const v of ['--l', '--r', '--t', '--b', '--hdr']) expect(rule('.gas-ph--fit svg'), v).toContain(`var(${v})`);
    for (const v of ['--pad', '--max', '--hdr']) expect(rule('.gas-ph--over svg'), v).toContain(`var(${v})`);
    const narrow = css.slice(css.indexOf('@media (max-width: 899px)'));
    for (const v of ['--nl', '--nr', '--nt', '--nb']) expect(narrow, v).toContain(`var(${v})`);
    for (const v of ['--closer', '--nmax', '--cover']) expect(narrow, v).toContain(`var(${v})`);
    // The canvas over it: see-through until shown, then an opacity fade as long as the stand-in waits for.
    expect(rule('.map-canvas.is-veiled')).toContain('opacity: 0');
    expect(rule('.map-canvas')).toContain(`transition: opacity ${MAP_REVEAL_FADE_MS / 1000}s`.replace('0.', '.'));
    // No animation of its own to switch off: with reduced motion the site's one rule makes both fades a single step.
    expect(fs.readFileSync(path.join(process.cwd(), 'src/styles/shell.css'), 'utf8')).toMatch(/prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{[^}]*transition-duration: \.01ms !important/);
  });
});
