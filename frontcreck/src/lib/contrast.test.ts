import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hexToRgb } from '@/lib/color';
import { ambientBackground } from '@/components/album/AmbientWash';
import type { AlbumRecord } from '@/lib/types';
import { contrastRatio, paintOver, rgbToHex, surfaceOver, type GlassFilter, type Rgb, type Tint } from './contrast';

const css = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
const GLOBALS = css('app/globals.css');

/** The hex colour tokens as globals.css defines them (`--color-room` → `room`, `--acc` → `acc`). */
const TOKENS: Record<string, string> = Object.fromEntries(
  [...GLOBALS.matchAll(/--(?:color-)?([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2].toLowerCase()]),
);
const tok = (name: string) => {
  const v = TOKENS[name];
  if (!v) throw new Error(`no colour token --${name} in globals.css`);
  return v;
};

/** The three see-through surfaces. Their first value in globals.css is the glass one; every later one is a solid fallback. */
type Surface = 'color-float' | 'panel-bg' | 'top-bg';
const SURFACES: Surface[] = ['color-float', 'panel-bg', 'top-bg'];
function tints(name: Surface): Tint[] {
  const re = new RegExp(`--${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`, 'g');
  const out = [...GLOBALS.matchAll(re)].map((m): Tint => ({ rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) }));
  if (!out.length) throw new Error(`no rgba value for --${name} in globals.css`);
  return out;
}
const GLASS = Object.fromEntries(SURFACES.map((s) => [s, tints(s)[0]])) as Record<Surface, Tint>;
const SOLID = Object.fromEntries(SURFACES.map((s) => [s, tints(s).slice(1)])) as Record<Surface, Tint[]>;
/** What the glass does to the map behind a panel (the blur does not change a flat colour). */
const FILTER: GlassFilter = (() => {
  const m = /--glass-blur:\s*blur\(22px\) saturate\(([\d.]+)\) brightness\(([\d.]+)\);/.exec(GLOBALS);
  if (!m) throw new Error('no glass filter (--glass-blur) in globals.css');
  return { saturate: Number(m[1]), brightness: Number(m[2]) };
})();

/** The brightest things a panel can sit over: a white cover, and the brightest (cream) gas. */
const WHITE: Rgb = [255, 255, 255];
const CREAM: Rgb = [244, 238, 222];
/** The text tokens each surface carries. The header sets only paper and dust (checked below). */
const TEXT_ON: Record<Surface, string[]> = {
  'color-float': ['paper', 'dust', 'ash', 'lamp'],
  'panel-bg': ['paper', 'dust', 'ash', 'lamp'],
  'top-bg': ['paper', 'dust'],
};

/** The declarations of the first rule whose selector is exactly `selector` in a stylesheet. */
function rule(sheet: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(sheet);
  if (!m) throw new Error(`no rule ${selector}`);
  return Object.fromEntries(
    m[1].split(';').map((d) => d.split(':')).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  );
}

/** A value's colour: a token (`var(--color-x)`), or the album accent for `var(--acc)`. */
function resolve(value: string, acc: string): string {
  const v = /var\(--(?:color-)?([a-z0-9-]+)\)/.exec(value)?.[1];
  if (!v) throw new Error(`not a token: ${value}`);
  return v === 'acc' ? acc : tok(v);
}

const ALBUMS = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as AlbumRecord[];
/** Every accent the page can show: each album's, plus the default before an album sets one. */
const ACCENTS: Array<[string, string]> = [['default', tok('acc')], ...ALBUMS.map((a): [string, string] => [a.slug, a.w[2]])];

describe('WCAG AA contrast', () => {
  it('computes reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('reads the tokens, the glass surfaces and the glass filter from globals.css', () => {
    expect(tok('room')).toBe('#07060a');
    expect(tok('lamp-ink')).toBe('#121016');
    expect(GLASS['color-float']).toEqual({ rgb: [10, 9, 14], alpha: 0.66 });
    expect(GLASS['panel-bg']).toEqual({ rgb: [8, 7, 11], alpha: 0.7 });
    expect(GLASS['top-bg']).toEqual({ rgb: [7, 6, 10], alpha: 0.58 });
    expect(FILTER).toEqual({ saturate: 1.2, brightness: 0.58 });
    // Solid is fully solid (alpha 1): nothing of the map shows through, on the phone header too.
    const solid: Tint = { rgb: [10, 9, 14], alpha: 1 };
    // Three fallback blocks (phone width, no backdrop-filter, reduced transparency), the same value in each.
    for (const s of SURFACES) expect(SOLID[s], s).toEqual([solid, solid, solid]);
  });

  it('models a glass panel: saturate, brightness, then the tint', () => {
    expect(surfaceOver(WHITE, FILTER, GLASS['panel-bg'])).toBe('#323134');
    expect(surfaceOver(WHITE, FILTER, GLASS['color-float'])).toBe('#39383c');
    expect(surfaceOver(WHITE, FILTER, GLASS['top-bg'])).toBe('#424244');
    expect(surfaceOver(WHITE, null, SOLID['panel-bg'][0])).toBe('#0a090e');
    expect(rgbToHex(paintOver([255, 255, 255], 0.5, [0, 0, 0]))).toBe('#808080');
  });

  it('every text token passes 4.5:1 on every opaque surface', () => {
    for (const fg of ['paper', 'dust', 'ash', 'lamp'].map(tok)) {
      for (const bg of ['room', 'room-2', 'room-3', 'room-4', 'pane'].map(tok)) {
        expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const sel of ['.btn-lamp', '.skip']) {
      const r = rule(css('styles/shell.css'), sel);
      expect(contrastRatio(resolve(r.color, ''), resolve(r.background, '')), sel).toBeGreaterThanOrEqual(4.5);
    }
    // The hovered lamp button, and the paper pills (toast, phone map button), set lamp-ink.
    expect(contrastRatio(tok('lamp-ink'), tok('lamp-hover'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tok('lamp-ink'), tok('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('every text token passes 4.5:1 on glass over the brightest backdrop', () => {
    for (const [name, backdrop] of [['white', WHITE], ['cream gas', CREAM]] as const) {
      for (const s of SURFACES) {
        const bg = surfaceOver(backdrop, FILTER, GLASS[s]);
        for (const t of TEXT_ON[s]) expect(contrastRatio(tok(t), bg), `${t} on --${s} glass over ${name} (${bg})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('the header sets only paper and dust, the two tokens that pass on its glass', () => {
    const shell = css('styles/shell.css');
    expect(rule(shell, '.wordmark').color).toBe('var(--color-paper)');
    expect(rule(shell, '.navbtn, .icon-btn').color).toBe('var(--color-dust)');
    expect(rule(shell, '.top').background).toBe('var(--top-bg)');
  });

  it('every text token passes 4.5:1 on the solid fallback over an unfiltered white backdrop', () => {
    for (const s of SURFACES) {
      for (const tint of SOLID[s]) {
        const bg = surfaceOver(WHITE, null, tint);
        for (const t of ['paper', 'dust', 'ash', 'lamp']) expect(contrastRatio(tok(t), bg), `${t} on solid --${s} (${bg})`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('every album accent passes 4.5:1 on the room colour, and 3:1 as a mark on the panels', () => {
    const room = tok('room');
    const glassPanel = surfaceOver(WHITE, FILTER, GLASS['panel-bg']);
    const solidPanel = surfaceOver(WHITE, null, SOLID['panel-bg'][0]);
    const bad = ACCENTS.flatMap(([s, acc]) => [
      contrastRatio(acc, room) < 4.5 ? `${s} ${acc} on the room ${contrastRatio(acc, room).toFixed(2)}` : '',
      contrastRatio(acc, glassPanel) < 3 ? `${s} ${acc} on the glass panel ${contrastRatio(acc, glassPanel).toFixed(2)}` : '',
      contrastRatio(acc, solidPanel) < 3 ? `${s} ${acc} on the solid panel ${contrastRatio(acc, solidPanel).toFixed(2)}` : '',
    ]).filter(Boolean);
    expect(bad).toEqual([]);
  });

  it('the hot rank badge on the map passes 4.5:1 for every album accent', () => {
    const hot = rule(css('styles/map.css'), '.mk-n[data-hot]');
    const bad = ACCENTS.filter(([, acc]) => contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)) < 4.5).map(
      ([s, acc]) => `${s} ${acc} ${contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)).toFixed(2)}`,
    );
    expect(bad).toEqual([]);
  });

  it('a lit mood tag passes 4.5:1 for every album accent, on the glass panel and on the solid one', () => {
    const lit = rule(css('styles/album.css'), '.tags li.lit');
    const mix = /color-mix\(in srgb, var\(--acc\) (\d+)%, transparent\)/.exec(lit.background);
    expect(mix, lit.background).not.toBeNull();
    const pct = Number(mix![1]) / 100;
    const panels = [surfaceOver(WHITE, FILTER, GLASS['panel-bg']), surfaceOver(WHITE, null, SOLID['panel-bg'][0])];
    const bad = ACCENTS.flatMap(([s, acc]) =>
      panels.filter((p) => contrastRatio(resolve(lit.color, acc), rgbToHex(paintOver(hexToRgb(acc), pct, hexToRgb(p)))) < 4.5).map((p) => `${s} ${acc} on ${p}`),
    );
    expect(bad).toEqual([]);
  });
});

describe('text over washes and bands', () => {
  const WORST_PANEL = hexToRgb(surfaceOver(WHITE, FILTER, GLASS['panel-bg']));

  it('paper and dust pass 4.5:1 on every album wash at full strength, on the brightest glass panel', () => {
    const opacity = Number(rule(css('styles/album.css'), '.amb').opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(1);
    const bad: string[] = [];
    for (const a of ALBUMS) {
      // The alphas ambientBackground gives the two washes (the panel variant paints w[0], then w[1]).
      const alphas = [...ambientBackground(a.w, 'panel').matchAll(/rgba\(\d+,\d+,\d+,([\d.]+)\)/g)].map((m) => Number(m[1]));
      a.w.slice(0, 2).forEach((wash, i) => {
        const bg = rgbToHex(paintOver(hexToRgb(wash), alphas[i] * opacity, WORST_PANEL));
        for (const t of ['paper', 'dust']) {
          if (contrastRatio(tok(t), bg) < 4.5) bad.push(`${a.slug} ${wash} ${t} ${contrastRatio(tok(t), bg).toFixed(2)}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('the About card is the glass panel and its body text passes on it', () => {
    const home = css('styles/home.css');
    expect(rule(home, '.about').background).toBe('var(--panel-bg)');
    expect(contrastRatio(rule(home, '.about p').color, rgbToHex(WORST_PANEL))).toBeGreaterThanOrEqual(4.5);
  });

  it('the Home search field is the float surface, on which its ash placeholder passes', () => {
    expect(rule(css('styles/search.css'), '.combo--hero .combo-field').background).toBe('var(--color-float)');
  });

  it('the map hint is paper on a band that holds 4.5:1 over an unfiltered white backdrop', () => {
    const hint = rule(css('styles/map.css'), '.map-hint');
    expect(hint.color).toBe('var(--color-paper)');
    const band = /rgba\(4, 4, 8, ([\d.]+)\) 50%/.exec(hint.background);
    expect(band, hint.background).not.toBeNull();
    const bg = surfaceOver(WHITE, null, { rgb: [4, 4, 8], alpha: Number(band![1]) });
    expect(contrastRatio(tok('paper'), bg), bg).toBeGreaterThanOrEqual(4.5);
  });
});
