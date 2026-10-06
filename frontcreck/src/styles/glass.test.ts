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
    // The solid panel colour, through the token that globals.css keeps equal to the three fallbacks' value.
    expect(tip).toContain('background: var(--color-float-solid);');
    expect(read('app/globals.css')).toContain('\n  --color-float-solid: rgba(10, 9, 14, 1);\n');
    expect(SOLID).toContain('--color-float: rgba(10, 9, 14, 1);');
    // No bare copy of it is left in the rules of the stylesheets (comments aside).
    for (const f of SHEETS.filter((x) => x !== 'app/globals.css')) expect(read(f).replace(/\/\*[\s\S]*?\*\//g, ''), f).not.toContain('rgba(10, 9, 14, 1)');
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

  it('the hero text sits on a blurred dark pad with no edge, as in the prototype', () => {
    const pad = rule(home, '.hero::before');
    expect(pad.background).toBe('rgba(5, 4, 8, .72)');
    expect(pad.filter).toBe('blur(26px)');
    expect(pad['pointer-events']).toBe('none');
    expect(pad['z-index']).toBe('-1');
    // The dark shape is the prototype's (pages.css): from --pad-top below the hero's top to 4 px below its last row,
    // 6 px wider than the hero, 40 px corners. It ends with the hero, so the brightest gas, just under the links,
    // stays bright; the links have their own pad (next test). The box is 80 px larger all round (a clear border),
    // so each inset is the prototype's less 80 and the corner radius is 40 + 80.
    expect(rule(home, '.hero')['--pad-top']).toBe('clamp(18px, 8vh, 92px)');
    expect(pad.border).toBe('80px solid transparent');
    expect(pad['background-clip']).toBe('padding-box');
    expect(pad['border-radius']).toBe('120px');
    expect(pad.inset).toBe('calc(var(--pad-top) - 80px) -86px -84px');
    // Phones: 22 px below the hero's top, as wide as the hero.
    expect(home).toContain('\n  .hero { padding-top: 40px; --pad-top: 22px; }\n  .hero::before { inset: calc(var(--pad-top) - 80px) -80px -84px; }\n');
  });

  it("the hero pad's halo is gone at the hero's top, where the Home layer is clipped under the header", () => {
    // The mask's box starts 80 px - --pad-top above the hero's top: clear down to the hero's top, full 30 px lower.
    const pad = rule(home, '.hero::before');
    const mask = 'linear-gradient(transparent calc(80px - var(--pad-top)), #000 calc(110px - var(--pad-top)))';
    expect(pad['mask-image']).toBe(mask);
    expect(pad['-webkit-mask-image']).toBe(mask);
    // The clip it answers: the Home layer scrolls, so it cuts its content at the stage's top, under the header.
    expect(rule(home, '.home')['overflow-y']).toBe('auto');
    expect(rule(home, '.home').inset).toBe('0');
  });

  it('the two links under the search field have a small pad of their own, static and no wider than their row', () => {
    expect(rule(home, '.hero-row').position).toBe('relative');
    const pad = rule(home, '.hero-row::before');
    expect(pad.background).toBe('rgba(5, 4, 8, .38)');
    expect(pad.filter).toBe('blur(10px)');
    // 280 px wide round the middle of the row (the two links are about 250), from 6 px inside the row's top to 2 px
    // below it: the dimmed gas under the links is about 280 x 22 px, not the hero's width.
    expect(pad.inset).toBe('6px calc(50% - 140px) -2px');
    expect(pad['z-index']).toBe('-1');
    expect(pad['pointer-events']).toBe('none');
    // Static: rasterised once, never animated, no layer hint.
    expect(home).not.toMatch(/will-change|animation|@keyframes/);
    for (const sel of ['.hero::before', '.hero-row::before', '.notfound::before, .page-msg::before']) expect(rule(home, sel).transition, sel).toBeUndefined();
  });

  it('the shelf has a full-width scrim, dark enough for its caption, clipped by the Home layer', () => {
    const scrim = rule(home, '.shelf::before');
    expect(scrim.background).toBe('linear-gradient(rgba(7, 6, 10, 0), rgba(7, 6, 10, .82) 30px)');
    expect(scrim.inset).toBe('0 -50vw');
    expect(scrim['pointer-events']).toBe('none');
    expect(rule(home, '.shelf').position).toBe('relative');
    expect(rule(home, '.home')['overflow-x']).toBe('hidden');
    // In a tall window the same scrim starts 40 px above the shelf and ramps over 76 px: full (.82) at the same line,
    // 36 px into the shelf where the caption starts (the shelf's top padding), with no floor line across the nebula.
    expect(home).toContain('\n@media (min-height: 861px) {\n  .shelf::before { inset: -40px -50vw 0; background: linear-gradient(rgba(7, 6, 10, 0), rgba(7, 6, 10, .82) 76px); }\n}\n');
    expect(rule(home, '.shelf').padding).toBe('36px var(--gut) 28px');
  });

  it('About and the 404 have the same light scrim; the 404 text sits on a blurred pad, as the hero does', () => {
    expect(rule(home, '.about-page').background).toBe('rgba(5, 4, 8, .3)');
    expect(rule(home, '.notfound, .page-msg').background).toBe('rgba(5, 4, 8, .3)');
    const pad = rule(home, '.notfound::before, .page-msg::before');
    expect(pad.background).toBe('rgba(5, 4, 8, .62)');
    expect(pad.filter).toBe('blur(26px)');
    expect(pad.width).toBe('min(600px, 100%)');
    expect(pad.height).toBe('320px');
    // Centred on the layer, where its grid centres the text.
    expect([pad.position, pad.left, pad.top, pad.transform]).toEqual(['absolute', '50%', '50%', 'translate(-50%, -50%)']);
    expect(pad['z-index']).toBe('-1');
    expect(pad['pointer-events']).toBe('none');
  });
});
