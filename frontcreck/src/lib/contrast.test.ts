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

  it('the Home header, which is clear, keeps paper and dust well over 4.5:1 over white through its scrim', () => {
    // Home's header has no glass; a see-through scrim in the page colour sits behind its text (shell.css
    // .top::before). The owner's ruling puts it between the first scrim (.76: as dark as the header glass over
    // pure white, dust 5.44) and the glass bar as it reads over real gas, where its blur spreads the bright peaks:
    // over pure white, with nothing else dimming the map, the scrim alone is darker than the glass.
    const scrim = rule(css('styles/shell.css'), '.top::before');
    const m = /^linear-gradient\(rgba\((\d+), (\d+), (\d+), ([\d.]+)\) /.exec(scrim.background);
    expect(m, scrim.background).not.toBeNull();
    const tint: Tint = { rgb: [Number(m![1]), Number(m![2]), Number(m![3])], alpha: Number(m![4]) };
    expect(rgbToHex(tint.rgb)).toBe(tok('room'));
    expect(tint.alpha).toBe(0.82);
    const bg = surfaceOver(WHITE, null, tint);
    expect(bg).toBe('#343336');
    for (const t of TEXT_ON['top-bg']) expect(contrastRatio(tok(t), bg), `${t} on the Home scrim over white (${bg})`).toBeGreaterThanOrEqual(4.5);
    const glass = contrastRatio(tok('dust'), surfaceOver(WHITE, FILTER, GLASS['top-bg']));
    // Stronger than the first scrim, which matched the glass here (5.44), by a clear step: 6.5 or more for dust.
    expect(contrastRatio(tok('dust'), bg)).toBeGreaterThanOrEqual(6.5);
    expect(contrastRatio(tok('dust'), bg)).toBeGreaterThan(glass + 1);
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
    // The band is clear at its top, reaches this darkness at a stop given in px, and only darkens below it.
    const band = /^linear-gradient\(rgba\(4, 4, 8, 0\), rgba\(4, 4, 8, ([\d.]+)\) (\d+)px, rgba\(4, 4, 8, ([\d.]+)\)\)$/.exec(hint.background);
    expect(band, hint.background).not.toBeNull();
    const [atStop, stopPx, atEnd] = [Number(band![1]), Number(band![2]), Number(band![3])];
    expect(atEnd).toBeGreaterThanOrEqual(atStop);
    const bg = surfaceOver(WHITE, null, { rgb: [4, 4, 8], alpha: atStop });
    expect(contrastRatio(tok('paper'), bg), bg).toBeGreaterThanOrEqual(4.5);
    // The text starts below the top padding, however many lines it wraps to: the stop must not be lower than that.
    const paddingTop = /^(\d+)px /.exec(hint.padding);
    expect(paddingTop, hint.padding).not.toBeNull();
    expect(stopPx).toBeLessThanOrEqual(Number(paddingTop![1]));
  });

  it('the hover label is paper and dust on a solid surface', () => {
    const tip = rule(css('styles/map.css'), '.map-tip');
    // The label's background is the solid-surface token; its value in globals.css must be fully opaque.
    expect(tip.background).toBe('var(--color-float-solid)');
    const value = /--color-float-solid:\s*([^;]+);/.exec(GLOBALS)?.[1] ?? '';
    const bg = /^rgba\((\d+), (\d+), (\d+), 1\)$/.exec(value);
    expect(bg, value).not.toBeNull();
    const solid = rgbToHex([Number(bg![1]), Number(bg![2]), Number(bg![3])]);
    expect(contrastRatio(tok('paper'), solid)).toBeGreaterThanOrEqual(4.5);
    expect(rule(css('styles/map.css'), '.map-tip .a').color).toBe('var(--color-dust)');
    expect(contrastRatio(tok('dust'), solid)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('marks on the map', () => {
  it('the selected ring is the lamp token on a dark casing that holds 3:1 on the brightest backdrops', () => {
    const sel = rule(css('styles/map.css'), '.map-sel');
    expect(sel.border).toBe('2px solid var(--color-lamp)');
    // 2 px of casing outside the ring and 1 px inside it, one colour.
    const casing = /^0 0 0 2px rgba\(4, 4, 8, ([\d.]+)\), inset 0 0 0 1px rgba\(4, 4, 8, \1\)$/.exec(sel['box-shadow'] ?? '');
    expect(casing, sel['box-shadow']).not.toBeNull();
    const tint: Tint = { rgb: [4, 4, 8], alpha: Number(casing![1]) };
    for (const [name, backdrop] of [['white', WHITE], ['cream gas', CREAM]] as const) {
      const dark = surfaceOver(backdrop, null, tint);
      expect(contrastRatio(tok('lamp'), dark), `the ring on its casing over ${name} (${dark})`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(dark, rgbToHex(backdrop)), `the casing against ${name}`).toBeGreaterThanOrEqual(3);
    }
    // Without the casing the ring cannot be seen on bright gas: this is what the casing is for.
    expect(contrastRatio(tok('lamp'), rgbToHex(CREAM))).toBeLessThan(1.5);
    // On the empty sky the ring carries itself.
    expect(contrastRatio(tok('lamp'), tok('pane'))).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring of the controls that stand on the map has the same dark casing, out past the ring', () => {
    // The site's one focus ring: a 2 px lamp outline that starts 3 px outside the control.
    const ring = rule(css('styles/shell.css'), ':focus-visible');
    expect(ring.outline).toBe('2px solid var(--color-lamp)');
    expect(ring['outline-offset']).toBe('3px');
    // Every focusable control in .map-ui: the zoom buttons, the names toggle and "Explore this area" stand on open
    // nebula (e2e/glass.spec.ts measures those three). The phone's List button is outside .map-ui, so it is named.
    const cased = rule(css('styles/map.css'), '.map-ui :focus-visible:not(input), .fab-map--on:focus-visible');
    // One band from the control's edge to 7 px out: the 3 px gap, the 2 px ring and 2 px beyond it.
    const casing = /^0 0 0 7px rgba\(4, 4, 8, ([\d.]+)\)$/.exec(cased['box-shadow'] ?? '');
    expect(casing, cased['box-shadow']).not.toBeNull();
    // Nothing but the shadow: the rule outranks .map-explore, .card .x and .fab-map, whose position and z-index
    // (the List button's 12) it must keep. Only a focused button of the zoom stack is lifted, over its neighbour.
    expect(Object.keys(cased)).toEqual(['box-shadow']);
    expect(rule(css('styles/map.css'), '.map-zoom :focus-visible')).toEqual({ 'z-index': '1' });
    const tint: Tint = { rgb: [4, 4, 8], alpha: Number(casing![1]) };
    for (const [name, backdrop] of [['white', WHITE], ['cream gas', CREAM]] as const) {
      const dark = surfaceOver(backdrop, null, tint);
      expect(contrastRatio(tok('lamp'), dark), `the focus ring on its casing over ${name} (${dark})`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(dark, rgbToHex(backdrop)), `the casing against ${name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the card's title keeps clear of the close button's focus ring and its casing, on wide screens and on phones", () => {
    const sheet = css('styles/map.css');
    const at = sheet.indexOf('@media (max-width: 899px)');
    expect(at).toBeGreaterThan(0);
    /** Every declaration of the rules whose selector is exactly `selector`, later ones winning. */
    const all = (part: string, selector: string): Record<string, string> => {
      const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const out: Record<string, string> = {};
      for (const m of part.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))) {
        for (const d of m[1].split(';')) {
          const [k, ...v] = d.split(':');
          if (v.length) out[k.trim()] = v.join(':').trim();
        }
      }
      return out;
    };
    const px = (v: string | undefined) => {
      const m = /^(\d+(?:\.\d+)?)px/.exec(v ?? '');
      if (!m) throw new Error(`not a px length: ${v}`);
      return Number(m[1]);
    };
    const BAND = 7;
    for (const [name, part] of [['wide', sheet.slice(0, at)], ['phone', sheet.slice(at)]] as const) {
      const [card, x, t] = [all(part, '.card'), all(part, '.card .x'), all(part, '.card .t')];
      // From the card's right edge: where the band ends, and where the title's text may begin.
      const band = px(x.right) + px(x.width) + BAND;
      const text = px(card.padding) + px(t['padding-right']);
      expect(text, `${name}: the title stops ${text} px from the edge, the band reaches ${band}`).toBeGreaterThanOrEqual(band);
    }
  });
});
