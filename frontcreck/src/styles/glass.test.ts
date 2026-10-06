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
      '.top', '.panel', '.album', '.map-zoom button', '.map-names', '.map-msg', '.about', '.combo--hero .combo-field', '.fab-map--on',
    ]);
  });

  it('the hover label is solid and above the hint band: no blur on the element that moves with the pointer', () => {
    // Dropped for speed: glass on the hover label. It is moved on every hover frame (OverlayDriver).
    const tip = /\n\.map-tip \{([^}]*)\}/.exec(read('styles/map.css'))![1];
    expect(tip).toContain('background: rgba(10, 9, 14, 1);');
    expect(tip).not.toContain('backdrop-filter');
    // Over .map-ui, whose hint band would otherwise paint on it.
    const z = (block: string) => Number(/z-index: (\d+)/.exec(block)![1]);
    expect(z(tip)).toBeGreaterThan(z(/\n\.map-ui \{([^}]*)\}/.exec(read('styles/map.css'))![1]));
  });

  it('the focused Home search field stays see-through: only the hero rule sets its background', () => {
    // It takes the focus on every desktop load of Home, and the approved picture (final-home.jpg) shows it as glass.
    const search = read('styles/search.css');
    const focus = search.indexOf('.combo-field:focus-within {');
    const hero = search.indexOf('.combo--hero .combo-field { ');
    expect(focus).toBeGreaterThan(-1);
    // The hero rule is as specific as the focus rule of every search field and comes after it: its glass wins.
    expect(hero).toBeGreaterThan(focus);
    expect(/\n\.combo--hero \.combo-field \{([^}]*)\}/.exec(search)![1]).toContain('background: var(--color-float);');
    // And no later rule gives the focused hero field a background of its own.
    expect(search).not.toMatch(/\.combo--hero \.combo-field:focus-within/);
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

  it('the album wash stays inside the panel: the map has no wash element and no stylesheet names one', () => {
    // It was hidden with `.map-amb { display: none; }`; now MapStage renders none, so there is nothing to hide.
    for (const f of SHEETS) expect(read(f), f).not.toContain('map-amb');
    const stage = read('components/map/MapStage.tsx');
    expect(stage).not.toContain('AmbientLayers');
    expect(stage).not.toContain('ambient');
    // The panel's own wash is still there.
    expect(read('styles/album.css')).toMatch(/(?:^|\n)\.amb \{/);
    expect(read('components/album/AlbumPanel.tsx')).toContain('<AmbientLayers ambient={seed.ambient} variant="panel" />');
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

/** The declarations of the first rule whose selector is exactly `selector` (as in lib/contrast.test.ts). */
function rule(sheet: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(sheet);
  if (!m) throw new Error(`no rule ${selector}`);
  return Object.fromEntries(
    m[1].split(';').map((d) => d.split(':')).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  );
}

// The gas runs at full strength behind these pages (shaders/gas.ts GAS_DIMMED_STRENGTH is 1), so everything that
// darkens it is here. e2e/pages.spec.ts measures the text over it; these pin the values that measurement passed on.
describe('Home, About and 404 over the nebula', () => {
  const home = read('styles/home.css');

  it('Home has one light even veil, the same on a phone', () => {
    expect(rule(read('styles/map.css'), '.veil').background).toBe('rgba(7, 6, 10, .1)');
    expect(read('styles/phone.css')).not.toMatch(/\.veil\b/);
  });

  it('the hero text sits on a blurred dark pad with no edge', () => {
    const pad = rule(home, '.hero::before');
    expect(pad.background).toBe('rgba(5, 4, 8, .78)');
    expect(pad.filter).toBe('blur(26px)');
    expect(pad['pointer-events']).toBe('none');
    expect(pad['z-index']).toBe('-1');
    // 28 px below the hero's last row, on wide screens and on phones: more than the blur's 26, so the row is on the full pad.
    expect(pad.inset).toBe('clamp(18px, 8vh, 92px) -6px -28px');
    expect(home).toContain('\n  .hero::before { inset: 22px 0 -28px; }\n');
  });

  it('the shelf has a full-width scrim, dark enough for its caption, clipped by the Home layer', () => {
    const scrim = rule(home, '.shelf::before');
    expect(scrim.background).toBe('linear-gradient(rgba(7, 6, 10, 0), rgba(7, 6, 10, .82) 30px)');
    expect(scrim.inset).toBe('0 -50vw');
    expect(scrim['pointer-events']).toBe('none');
    expect(rule(home, '.shelf').position).toBe('relative');
    expect(rule(home, '.home')['overflow-x']).toBe('hidden');
  });

  it('About has a light scrim round its glass card, the 404 a dark one under its bare text', () => {
    expect(rule(home, '.about-page').background).toBe('rgba(5, 4, 8, .3)');
    expect(rule(home, '.notfound, .page-msg').background).toBe('rgba(5, 4, 8, .73)');
  });
});
