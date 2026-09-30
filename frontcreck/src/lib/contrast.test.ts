import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hexToRgb } from '@/lib/color';
import type { AlbumRecord } from '@/lib/types';
import { contrastRatio } from './contrast';

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

/** `top` at `pct` opacity painted over the opaque `bottom` (sRGB, as `color-mix(in srgb, top pct%, transparent)`). */
function over(top: string, pct: number, bottom: string): string {
  const [a, b] = [hexToRgb(top), hexToRgb(bottom)];
  return `#${a.map((c, i) => Math.round(c * pct + b[i] * (1 - pct)).toString(16).padStart(2, '0')).join('')}`;
}

const ALBUMS = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/albums.json'), 'utf8')) as AlbumRecord[];
/** Every accent the page can show: each album's, plus the default before an album sets one. */
const ACCENTS: Array<[string, string]> = [['default', tok('acc')], ...ALBUMS.map((a): [string, string] => [a.slug, a.w[2]])];

describe('WCAG AA contrast', () => {
  it('computes reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('reads the tokens from globals.css', () => {
    expect(tok('room')).toBe('#15110d');
    expect(tok('lamp-ink')).toBe('#1a130b');
  });

  it('every text token passes 4.5:1 on every surface it is used on', () => {
    for (const fg of ['paper', 'dust', 'ash', 'lamp'].map(tok)) {
      for (const bg of ['room', 'room-2', 'room-3', 'room-4', 'float', 'pane'].map(tok)) {
        expect(contrastRatio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const sel of ['.btn-lamp', '.skip']) {
      const r = rule(css('styles/shell.css'), sel);
      expect(contrastRatio(resolve(r.color, ''), resolve(r.background, '')), sel).toBeGreaterThanOrEqual(4.5);
    }
    // The paper pills (toast, phone map button) set lamp-ink on paper.
    expect(contrastRatio(tok('lamp-ink'), tok('paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('every album accent passes 4.5:1 on the room colour', () => {
    const bad = ACCENTS.filter(([, acc]) => contrastRatio(acc, tok('room')) < 4.5).map(([s, acc]) => `${s} ${acc}`);
    expect(bad).toEqual([]);
  });

  it('the hot rank badge on the map passes 4.5:1 for every album accent', () => {
    const hot = rule(css('styles/map.css'), '.mk-n[data-hot]');
    const bad = ACCENTS.filter(([, acc]) => contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)) < 4.5).map(
      ([s, acc]) => `${s} ${acc} ${contrastRatio(resolve(hot.color, acc), resolve(hot.background, acc)).toFixed(2)}`,
    );
    expect(bad).toEqual([]);
  });

  it('a lit mood tag passes 4.5:1 for every album accent', () => {
    const lit = rule(css('styles/album.css'), '.tags li.lit');
    const mix = /color-mix\(in srgb, var\(--acc\) (\d+)%, transparent\)/.exec(lit.background);
    expect(mix, lit.background).not.toBeNull();
    const panel = resolve(rule(css('styles/album.css'), '.album').background, '');
    const bad = ACCENTS.filter(([, acc]) => contrastRatio(resolve(lit.color, acc), over(acc, Number(mix![1]) / 100, panel)) < 4.5).map(
      ([s, acc]) => `${s} ${acc}`,
    );
    expect(bad).toEqual([]);
  });
});
