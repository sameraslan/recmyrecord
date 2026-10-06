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
    for (const sel of ['.hero::before', '.hero-row::before', '.shelf-now::before', '.notfound::before, .page-msg::before']) expect(rule(home, sel).transition, sel).toBeUndefined();
  });

  it("the shelf has the prototype's scrim: its own width, light at the caption, so the gas runs on into the covers", () => {
    const scrim = rule(home, '.shelf::before');
    // pages.css of the prototype: from 10 px below the shelf's top, reaching .7 at 40 % of its height (inside the
    // first row of covers). One rule for every window: no other .shelf::before, so no floor line at any size.
    expect(scrim.background).toBe('linear-gradient(rgba(5, 4, 8, 0), rgba(5, 4, 8, .7) 40%)');
    expect(scrim.inset).toBe('10px 0 0');
    expect(scrim['pointer-events']).toBe('none');
    expect(scrim['z-index']).toBe('-1');
    expect(home.match(/\.shelf::before/g)).toHaveLength(1);
    expect(rule(home, '.shelf').position).toBe('relative');
    expect(rule(home, '.shelf').padding).toBe('36px var(--gut) 28px');
    // Still needed: the hero pad is wider than a phone's window.
    expect(rule(home, '.home')['overflow-x']).toBe('hidden');
  });

  it("the shelf's line has a small pad of its own that follows its words, static, as the hero links have", () => {
    // The line is as wide as its words (the caption, or a title and an artist), so the pad behind it is too; it must
    // not clip the pad (no overflow: hidden), and the title still shortens with an ellipsis inside the shelf's width.
    const line = rule(home, '.shelf-now');
    expect(line.position).toBe('relative');
    expect(line.width).toBe('fit-content');
    expect(line['max-width']).toBe('100%');
    expect(line.margin).toBe('0 auto 12px');
    expect(line.overflow).toBeUndefined();
    expect(rule(home, '.shelf-now .t').overflow).toBe('hidden');
    const pad = rule(home, '.shelf-now::before');
    // .82 is the ladder's value for the caption (ash, the weakest text): 5.2:1 with the brightest gas under it
    // (.78 gives 4.7, .86 gives 5.8; GPU, e2e/pages.spec.ts measures it). From 10 px above the
    // 30 px line to 4 px below it and 24 px wider each side, blurred 8 px: it covers the caption at the line's top
    // and the artist's name at its bottom.
    expect(pad.background).toBe('rgba(5, 4, 8, .82)');
    expect(pad.filter).toBe('blur(8px)');
    expect(pad.inset).toBe('-10px -24px -4px');
    expect(pad['border-radius']).toBe('22px');
    expect(pad['z-index']).toBe('-1');
    expect(pad['pointer-events']).toBe('none');
    expect(pad.transition).toBeUndefined();
  });

  it('short windows have a compact hero: a smaller heading and less room above it, the pad starting above the heading', () => {
    // A desktop window 860 px tall or less: the heading on one line (56 px at most, never wrapped, and allowed 40 px
    // past the hero each side should a fallback font run wide), 3vh above it, the pad's dark shape 16 px higher.
    expect(home).toContain(
      '\n@media (min-width: 900px) and (max-height: 860px) {\n  .hero { padding-top: clamp(20px, 3vh, 28px); --pad-top: clamp(4px, calc(3vh - 16px), 12px); }\n  .hero h1 { margin: 0 -40px; font-size: clamp(42px, min(5.8vw, 8.1vh), 56px); white-space: nowrap; }\n}\n',
    );
    // A phone under 700 px tall: the same tightening; on a narrow one the heading keeps two even lines.
    expect(home).toContain(
      '\n@media (max-width: 899px) and (max-height: 699px) {\n  .hero { padding-top: 22px; --pad-top: 6px; }\n  .hero h1 { font-size: clamp(32px, 9.4vw, 52px); }\n}\n@media (max-width: 479px) and (max-height: 699px) {\n  .hero h1 { max-width: 8.6em; margin-inline: auto; }\n}\n',
    );
    // These come after the phone block, whose .hero rule they override.
    expect(home.indexOf('(max-height: 699px)')).toBeGreaterThan(home.indexOf('\n  .hero { padding-top: 40px; --pad-top: 22px; }\n'));
  });

  it('short windows show one row of covers: the second row is hidden where the hero is compact, and nowhere else', () => {
    // The owner's ruling: one row at 360 x 640 and in short desktop windows (1440 x 790, 1280 x 720). The heights
    // are the compact hero's: 860 px or less in a desktop window, under 700 px on a phone. The row is as long as
    // the grid has columns: 12 from 1180 px of width, 8 from 900, 4 below.
    expect(home).toContain(
      '\n@media (min-width: 1180px) and (max-height: 860px) {\n  .mosaic li:nth-child(n+13) { display: none; }\n}\n@media (min-width: 900px) and (max-width: 1179px) and (max-height: 860px) {\n  .mosaic li:nth-child(n+9) { display: none; }\n}\n@media (max-width: 899px) and (max-height: 699px) {\n  .mosaic li:nth-child(n+5) { display: none; }\n}\n',
    );
    // The columns those rows are counted from.
    expect(rule(home, '.mosaic')['grid-template-columns']).toBe('repeat(12, minmax(0, 1fr))');
    expect(home).toContain('@media (max-width: 1179px) {\n  .mosaic { grid-template-columns: repeat(8, minmax(0, 1fr)); }');
    expect(home).toContain('  .mosaic { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }');
    // Nothing else is taken away in a short window: the only things hidden by a height rule are those covers.
    const hidden = [...home.matchAll(/@media[^{]*max-height[^{]*\{([^@]*)\}/g)].flatMap((m) => [...m[1].matchAll(/([^{}]+)\{[^}]*display: none[^}]*\}/g)].map((r) => r[1].trim()));
    expect(hidden.sort()).toEqual(['.mosaic li:nth-child(n+13)', '.mosaic li:nth-child(n+5)', '.mosaic li:nth-child(n+9)']);
    // Taller windows keep two rows: without a height, only the columns that do not fit are hidden.
    expect(home).not.toMatch(/\n\.mosaic li:nth-child\(n\+\d+\) \{ display: none/);
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
