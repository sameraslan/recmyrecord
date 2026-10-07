import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUT } from '@/components/map/state/mapStore';
import { HEADER_NARROW_PX, HEADER_PX } from '@/components/map/types';
import * as media from '@/lib/media';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector` in a stylesheet. */
function rule(sheet: string, selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`).exec(sheet);
  if (!m) throw new Error(`no rule ${selector}`);
  return Object.fromEntries(
    m[1].split(';').map((d) => d.split(':')).filter((p) => p.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()]),
  );
}

describe('the map behind the header', () => {
  const shell = read('styles/shell.css');
  const map = read('styles/map.css');

  it('the two header heights in CSS and the two camera top insets are the same numbers, switched at one breakpoint', () => {
    const globals = read('app/globals.css');
    // The wide height is in the plain :root block; the narrow one is in the (max-width: 899px) block that sets it.
    const wide = /(?:^|\n):root \{[^}]*--hdr:\s*(\d+)px;/.exec(globals);
    const narrow = /@media \(max-width: 899px\) \{\s*:root \{[^}]*--hdr:\s*(\d+)px;/.exec(globals);
    expect(wide, '--hdr in :root').not.toBeNull();
    expect(narrow, '--hdr under 900 px').not.toBeNull();
    expect(Number(wide![1])).toBe(HEADER_PX);
    expect(Number(narrow![1])).toBe(HEADER_NARROW_PX);
    expect(HEADER_PX).toBe(64);
    expect(HEADER_NARROW_PX).toBe(60);
    // No third height anywhere.
    expect([...globals.matchAll(/--hdr:\s*\d+px/g)]).toHaveLength(2);
    // MapStage picks the inset with useIsNarrow, whose media query is the CSS block's.
    expect(media.NARROW_MEDIA_QUERY).toBe('(max-width: 899px)');
    expect(read('components/map/MapStage.tsx')).toContain('insetTop: narrow ? HEADER_NARROW_PX : HEADER_PX,');
    expect(DEFAULT_INPUT.insetTop).toBe(HEADER_PX);
    expect(rule(shell, '.top').height).toBe('var(--hdr)');
  });

  it('the two heights are defined once, in lib/media.ts, which MapStage already loads: components/map/types.ts only passes them on', () => {
    // MapStage imports types.ts for types only, so it stays out of the first-load chunk; a value defined there
    // would pull the module in (MapStage.tsx sits just under the size at which that chunk splits).
    expect(media.HEADER_PX).toBe(HEADER_PX);
    expect(media.HEADER_NARROW_PX).toBe(HEADER_NARROW_PX);
    expect(read('components/map/types.ts')).toContain("export { HEADER_NARROW_PX, HEADER_PX } from '@/lib/media';");
    const stage = read('components/map/MapStage.tsx');
    expect(stage).toContain("import { HEADER_NARROW_PX, HEADER_PX, useIsNarrow } from '@/lib/media';");
    expect(stage).toMatch(/import type \{[^}]*\} from '\.\/types';/);
    expect(stage).not.toMatch(/import \{[^}]*\} from '\.\/types';/);
    // 19,936 bytes before the map ran under the header; about 20,000 splits the first-load chunk.
    expect(Buffer.byteLength(stage)).toBeLessThanOrEqual(19936);
  });

  it('the stage stays below the header and no longer clips; the map pane alone reaches up under it and clips itself', () => {
    const stage = rule(shell, '.stage');
    expect(stage.top).toBe('var(--hdr)');
    expect(stage.overflow).toBeUndefined();
    const pane = rule(map, '.map-pane');
    expect(pane.top).toBe('calc(-1 * var(--hdr))');
    expect(pane.overflow).toBe('hidden');
  });

  it('the map controls and its messages stay below the header', () => {
    expect(rule(map, '.map-ui').top).toBe('var(--hdr)');
    expect(rule(map, '.map-msg').top).toBe('calc(50% + var(--hdr) / 2)');
  });

  it('the header is above every layer of the stage, the glints included', () => {
    expect(rule(shell, '.top')['z-index']).toBe('60');
    for (const f of ['styles/map.css', 'styles/album.css', 'styles/home.css', 'styles/phone.css']) {
      const over = [...read(f).matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1])).filter((z) => z >= 60);
      expect(over, f).toEqual([]);
    }
  });

  it('the glints are told the height of the header', () => {
    // The glint layer reads state/stageTop.ts; MusicMap sets it from the map input in the effect that applies the input.
    expect(read('components/map/MusicMap.tsx')).toContain('setStageTop(input.insetTop);');
  });

  it('the canvas focus ring is drawn on the host, inside the visible map, with a fallback where :has is missing', () => {
    expect(map).toContain('.map-host:has(.map-canvas:focus-visible)::after');
    expect(rule(map, '.map-host:has(.map-canvas:focus-visible)::after').inset).toBe('calc(var(--hdr) + 4px) 4px 4px');
    expect(map).toContain('@supports not selector(:has(a))');
  });

  it('the Home header stays clear, with a still scrim behind its text that fades out below the bar', () => {
    // Home keeps a camera the visitor moved, so the brightest gas can sit behind its header, which is not glass.
    expect(rule(shell, '.top.top--home').background).toBe('transparent');
    expect(shell).toContain('.top.top--home { -webkit-backdrop-filter: none; backdrop-filter: none; }');
    const scrim = rule(shell, '.top::before');
    expect(scrim.content).toBe('""');
    expect(scrim['pointer-events']).toBe('none');
    // Over the bar's own (clear) background, behind its text.
    expect(scrim['z-index']).toBe('-1');
    // On Home only, eased in and out with the bar's own colour change.
    expect(scrim.opacity).toBe('0');
    expect(scrim.transition).toBe('opacity var(--dur) var(--out)');
    expect(rule(shell, '.top.top--home::before').opacity).toBe('1');
    // A plain gradient: no blur and no filter, so it costs nothing while the map moves under it.
    for (const p of ['backdrop-filter', '-webkit-backdrop-filter', 'filter', 'animation']) expect(scrim[p], p).toBeUndefined();
    expect(shell).not.toMatch(/\.top::before[^{]*,[^{]*\{[^}]*backdrop-filter/);
    // The owner's ruling: between the first, soft scrim (.76 to 8 px above the bar's bottom edge, gone 40 px below
    // it) and the glass bar of the other pages. So it is stronger and taller: .82 over the whole bar, down to its
    // bottom edge, at both header heights (the first one already covered the links' 44 px boxes: (hdr + 44) / 2),
    // then fading to nothing 52 px below the bar, still with no edge and no hairline.
    expect(scrim.background).toBe('linear-gradient(rgba(7, 6, 10, .82) var(--hdr), rgba(7, 6, 10, .55) calc(var(--hdr) + 14px), rgba(7, 6, 10, .22) calc(var(--hdr) + 32px), rgba(7, 6, 10, 0))');
    expect(scrim.height).toBe('calc(var(--hdr) + 52px)');
    for (const hdr of [HEADER_PX, HEADER_NARROW_PX]) expect(hdr, `${hdr} px header`).toBeGreaterThanOrEqual((hdr + 44) / 2);
    expect(rule(shell, '.navbtn, .icon-btn')['min-height']).toBe('44px');
    // No bar: the header itself still has no background, no edge line and no blur on Home.
    expect(rule(shell, '.top.top--home')['border-color']).toBe('transparent');
  });

  it('no text of the header is in the ash colour: it is 4.06:1 on the header glass over white', () => {
    const globals = read('app/globals.css');
    const ash = /--color-ash:\s*(#[0-9a-f]{6})/i.exec(globals);
    expect(ash, '--color-ash').not.toBeNull();
    // The header's own parts. Its search field is an opaque box (search.css), so the rules of what is inside that
    // box are not the header's.
    const HEADER = /(?:^|[\s,>+~])(?:header)?\.top(?![\w-])|\.wordmark|\.navbtn|\.icon-btn|\.search-toggle|\.top-search(?![\w-])/;
    let seen = 0;
    for (const f of ['app/globals.css', 'styles/shell.css', 'styles/search.css', 'styles/phone.css', 'styles/home.css']) {
      const sheet = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1].trim();
        if (!HEADER.test(selector)) continue;
        seen++;
        expect(m[2], `${f}: ${selector}`).not.toMatch(/var\(--color-ash\)/);
        expect(m[2].toLowerCase(), `${f}: ${selector}`).not.toContain(ash![1].toLowerCase());
      }
    }
    // The scan found the header's rules (the bar, the wordmark, the nav buttons and their states at least).
    expect(seen).toBeGreaterThanOrEqual(8);
  });
});
