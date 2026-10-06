import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
const SHEETS = ['app/globals.css', 'styles/shell.css', 'styles/home.css', 'styles/search.css', 'styles/map.css', 'styles/album.css', 'styles/phone.css'];
const SOLID = '--glass-blur: none; --color-float: rgba(10, 9, 14, 1); --panel-bg: rgba(10, 9, 14, 1); --top-bg: rgba(10, 9, 14, 1);';

/** A stylesheet without the map marker rules (map.css, "focus markers" up to the phone block): the map-markers
 * work restyles those itself. */
const mine = (file: string) => (file === 'styles/map.css' ? read(file).replace(/\/\* focus markers[\s\S]*?(?=\n@media)/, '') : read(file));

describe('glass', () => {
  it('one rule gives every glass surface the blur, with the Safari prefix first', () => {
    const m = /\n([^{}\n]+)\{\s*-webkit-backdrop-filter: var\(--glass-blur\); backdrop-filter: var\(--glass-blur\);\s*\}/.exec(read('styles/shell.css'));
    expect(m, 'the glass rule in shell.css').not.toBeNull();
    expect(m![1].split(',').map((s) => s.trim())).toEqual([
      '.top', '.panel', '.album', '.map-zoom button', '.map-names', '.map-tip', '.map-msg', '.about', '.combo--hero .combo-field', '.fab-map--on',
    ]);
  });

  it('no surface sets a blur of its own, so --glass-blur switches all of them', () => {
    // globals.css only defines the property (and names backdrop-filter in its @supports test); the rules are in styles/.
    for (const f of SHEETS.filter((s) => s !== 'app/globals.css')) {
      const own = [...read(f).matchAll(/backdrop-filter:\s*([^;]+);/g)].map((x) => x[1]).filter((v) => v !== 'var(--glass-blur)' && v !== 'none');
      expect(own, f).toEqual([]);
    }
  });

  it('the Home header stays clear', () => {
    expect(read('styles/shell.css')).toContain('.top.top--home { -webkit-backdrop-filter: none; backdrop-filter: none; }');
  });

  it('phones, browsers without backdrop-filter and reduced transparency get the same solid panels', () => {
    const globals = read('app/globals.css');
    for (const block of [
      `@media (max-width: 899px) { :root { ${SOLID} } }`,
      `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { :root { ${SOLID} } }`,
      `@media (prefers-reduced-transparency: reduce) { :root { ${SOLID} } }`,
    ]) {
      expect(globals).toContain(block);
    }
  });

  it('the album panel is glass on wide screens and opaque as the phone list', () => {
    expect(read('styles/album.css')).toMatch(/^\.album \{[^}]*background: var\(--panel-bg\);/m);
    expect(read('styles/phone.css')).toMatch(/\n {2}\.album \{[^}]*background: var\(--color-room\);/);
  });

  it("the album panel's only background outside the phone block is --panel-bg, the surface contrast.test.ts models", () => {
    // contrast.test.ts ("a lit mood tag ...", "every text token ... on glass") computes on the --panel-bg tints of
    // globals.css. This ties those numbers to the rule the panel really uses: one base rule, one value.
    const album = read('styles/album.css');
    const base = [...album.matchAll(/(?:^|\n)\.album \{([^}]*)\}/g)].map((m) => /(?:^|;)\s*background(?:-color)?:\s*([^;]+);/.exec(m[1])?.[1]);
    expect(base).toEqual(['var(--panel-bg)']);
    for (const f of SHEETS.filter((s) => s !== 'styles/album.css' && s !== 'styles/phone.css')) {
      expect(/(?:^|[\n,}])\s*\.album \{[^}]*background/.test(read(f)), f).toBe(false);
    }
  });

  it('the album wash stays inside the panel', () => {
    expect(read('styles/album.css')).toContain('.map-amb { display: none; }');
  });

  it('no colour of the old warm theme is left in the stylesheets', () => {
    const OLD = ['237, 229, 213', '21, 17, 13', '12, 10, 8', '230, 168, 86', '#efb86c', '#d9d0bf', '#15110d', '#1a1511', '#17120e', '#e6a856'];
    for (const f of SHEETS) {
      const text = mine(f);
      expect(OLD.filter((c) => text.includes(c)), f).toEqual([]);
    }
  });

  it('the album accent is never a text colour', () => {
    for (const f of SHEETS) expect(/(?:^|[\s;{])color:\s*var\(--acc\)/m.test(read(f)), f).toBe(false);
  });

  it('the toast keeps clear of the bottom safe area', () => {
    // A phone with a home indicator: 28 px above the inset, not 28 px above the glass edge.
    expect(read('styles/shell.css')).toMatch(/\.toast \{\s*position: fixed; left: 50%; bottom: calc\(28px \+ env\(safe-area-inset-bottom\)\);/);
  });

  it('the film grain overlay is gone', () => {
    for (const f of SHEETS) {
      const text = read(f);
      expect(/\.grain\b/.test(text), f).toBe(false);
      expect(text.includes('feTurbulence'), f).toBe(false);
    }
    expect(read('app/layout.tsx')).not.toContain('grain');
  });
});
