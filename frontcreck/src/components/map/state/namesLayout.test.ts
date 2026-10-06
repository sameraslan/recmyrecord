import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ThemeLabel } from '@/lib/data/theme';
import { NAMES_BAND_PX } from '../theme';
import { COVER_FADE_START_PX } from './zoomLimits';
import '../../../../scripts/theme/bake-core.js';
import {
  NAMES_MAX_PHONE,
  NAME_EDGE_PX,
  NAME_LUM_PX_PER_WORLD,
  NAME_LUM_WIDE_PX_PER_WORLD,
  NAME_OFFSETS,
  chromeBlockers,
  createWidthCache,
  haloFor,
  layoutNames,
  luminance,
  nameContrast,
  nameFades,
  nameFontPx,
  nameKey,
  namesShown,
  nameZoomK,
  type NameCandidate,
  type NamesInput,
} from './namesLayout';

function label(id: string, p: number, extra: Partial<ThemeLabel> = {}): ThemeLabel {
  return { id, name: 'Playful Way', x: 0, y: 0, strong: true, n: 300, p, rgb: [240, 236, 228], lum: 0.4, ...extra };
}
function cand(id: string, x: number, y: number, p: number, extra: Partial<ThemeLabel> = {}, alpha = 1): NameCandidate {
  return { key: nameKey('balanced', id), label: label(id, p, extra), x, y, alpha };
}
const widths = createWidthCache((text) => text.length * 62);
const DESKTOP = { width: 1440, height: 836, top: 0, inset: 0, phone: false, bottomCover: 0, card: false };

function input(over: Partial<NamesInput>): NamesInput {
  return {
    candidates: [],
    visible: { left: 0, top: 0, right: 1440, bottom: 836 },
    blockers: chromeBlockers(DESKTOP),
    phone: false,
    zoomK: 1,
    pxPerWorld: NAME_LUM_PX_PER_WORLD,
    fullHalo: false,
    widthOf: widths.widthOf,
    sticky: new Map(),
    ...over,
  };
}

describe('when names show', () => {
  it('is while covers would be under 13 px, and not above', () => {
    expect(namesShown(4, false)).toBe(true);
    expect(namesShown(12.9, false)).toBe(true);
    expect(namesShown(13, false)).toBe(false);
    expect(namesShown(32, false)).toBe(false);
  });

  it('is never once covers show: the band ends before the cover fade starts', () => {
    expect(NAMES_BAND_PX).toBeLessThan(COVER_FADE_START_PX);
    for (const cover of [COVER_FADE_START_PX, 20, 32, 64]) expect(namesShown(cover, false)).toBe(false);
  });

  it('is never while an album is open, whatever the zoom', () => {
    for (const cover of [1, 4, 12.9, 13, 32]) expect(namesShown(cover, true)).toBe(false);
  });
});

describe('name sizes', () => {
  it('follows the two tiers at k = 0.88, in half-pixel steps', () => {
    expect(nameFontPx({ strong: true, n: 346 }, false, 1)).toBe(21);
    expect(nameFontPx({ strong: true, n: 300 }, false, 1)).toBe(20.5);
    expect(nameFontPx({ strong: false, n: 346 }, false, 1)).toBe(16);
    expect(nameFontPx({ strong: false, n: 50 }, false, 0.85)).toBe(12);
  });

  it('is clamped to 13 to 16 px on a phone, whatever the zoom', () => {
    expect(nameFontPx({ strong: true, n: 1000 }, true, 1.35)).toBe(15);
    expect(nameFontPx({ strong: false, n: 10 }, true, 0.85)).toBe(13);
  });

  it('scales gently with the zoom, between 0.85 and 1.35', () => {
    expect(nameZoomK(12.5)).toBe(1);
    expect(nameZoomK(1)).toBe(0.85);
    expect(nameZoomK(64)).toBe(1.35);
  });
});

describe('nameFades (slider morph)', () => {
  it('shows the current stop at rest', () => {
    expect(nameFades(0.5, 'balanced', 'balanced')).toEqual([{ stop: 'balanced', alpha: 1 }]);
    expect(nameFades(1, 'balanced', 'mood')).toEqual([{ stop: 'mood', alpha: 1 }]);
  });

  it('fades the outgoing names out over the first 40% and the incoming in over the last 40%', () => {
    expect(nameFades(0.5, 'balanced', 'mood')).toEqual([{ stop: 'balanced', alpha: 1 }]);
    const early = nameFades(0.6, 'balanced', 'mood');
    expect(early).toHaveLength(1);
    expect(early[0].stop).toBe('balanced');
    expect(early[0].alpha).toBeCloseTo(0.5, 6);
    expect(nameFades(0.75, 'balanced', 'mood')).toEqual([]);
    const late = nameFades(0.9, 'balanced', 'mood');
    expect(late).toHaveLength(1);
    expect(late[0].stop).toBe('mood');
    expect(late[0].alpha).toBeCloseTo(0.5, 6);
  });

  it('works across the middle stop and backwards', () => {
    expect(nameFades(0.5, 'sonic', 'mood')).toEqual([]);
    expect(nameFades(0.9, 'mood', 'sonic')[0]).toEqual({ stop: 'mood', alpha: expect.closeTo(0.75, 6) });
  });
});

describe('halo strength and contrast', () => {
  it('reaches 4.5:1 against the brightest gas, for full and for fair names', () => {
    let worst = Infinity;
    for (let bg = 0; bg <= 1.0001; bg += 0.05) {
      for (const ink of [0.5, 0.7, luminance([240, 236, 228]), 1]) {
        for (const a of [1, 0.82]) worst = Math.min(worst, nameContrast(bg, ink, a, haloFor(bg, ink, a)));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  it('is weaker on dim gas than on bright gas, and never under 0.65', () => {
    expect(haloFor(0.1, 0.8)).toBe(0.65);
    expect(haloFor(1, 0.8)).toBeGreaterThan(haloFor(0.1, 0.8));
    expect(haloFor(1, 0.8)).toBeLessThanOrEqual(1);
  });

  it('is full when no halo can reach the ratio', () => {
    expect(haloFor(1, 0.1)).toBe(1);
  });

  it('measures luminance as WCAG does', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6);
    expect(luminance([0, 0, 0])).toBe(0);
  });
});

describe('layoutNames', () => {
  it('places the higher priority name on its centre and nudges the other, with a full halo once nudged', () => {
    const sticky = new Map<string, number>();
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5), cand('b', 705, 405, 9)], sticky }));
    expect(out.map((p) => p.key)).toEqual([nameKey('balanced', 'b'), nameKey('balanced', 'a')]);
    expect([out[0].x, out[0].y]).toEqual([705, 405]);
    expect(out[0].halo).toBe(haloFor(0.4, luminance([240, 236, 228])));
    expect([out[1].x, out[1].y]).not.toEqual([700, 400]);
    expect(out[1].halo).toBe(1);
    expect(sticky.get(nameKey('balanced', 'b'))).toBe(0);
  });

  it('keeps a name on the spot it had, so it does not jump while the map moves', () => {
    const sticky = new Map<string, number>([[nameKey('balanced', 'a'), 2]]);
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5)], sticky }));
    expect([out[0].x, out[0].y]).toEqual([700, 422]);
  });

  it('skips names whose album cloud is off screen, and names fully faded out', () => {
    const out = layoutNames(input({ candidates: [cand('off', 2000, 400, 9), cand('gone', 700, 400, 8, {}, 0), cand('in', 700, 600, 1)] }));
    expect(out.map((p) => p.key)).toEqual([nameKey('balanced', 'in')]);
  });

  it('never puts a name over the slider card, the zoom corner or the hint line, or within 10 px of the edge', () => {
    const blockers = chromeBlockers(DESKTOP);
    const cands = [cand('slider', 140, 80, 9), cand('zoom', 1410, 740, 8), cand('hint', 150, 825, 7), cand('edge', 30, 400, 6)];
    const out = layoutNames(input({ candidates: cands }));
    // The hint candidate finds a spot above the hint line: the checks below run on at least one name.
    expect(out.length).toBeGreaterThan(0);
    for (const p of out) {
      const w = widths.widthOf(label('x', 0), p.fontPx) / 2 + 6;
      const h = (p.fontPx * 1.05) / 2 + 4;
      const box = { left: p.x - w, top: p.y - h, right: p.x + w, bottom: p.y + h };
      for (const k of blockers) expect(box.left < k.right && box.right > k.left && box.top < k.bottom && box.bottom > k.top, p.key).toBe(false);
      expect(box.left).toBeGreaterThanOrEqual(NAME_EDGE_PX);
      expect(box.right).toBeLessThanOrEqual(1440 - NAME_EDGE_PX);
    }
  });

  it('shows at most four names on a phone', () => {
    const phone = { width: 390, height: 780, top: 0, inset: 0, phone: true, bottomCover: 165, card: false };
    const cands = Array.from({ length: 9 }, (_, i) => cand(`n${i}`, 195, 60 + 55 * i, i));
    const out = layoutNames(input({ candidates: cands, phone: true, visible: { left: 0, top: 0, right: 390, bottom: 780 }, blockers: chromeBlockers(phone) }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(NAMES_MAX_PHONE);
    for (const p of out) expect(p.fontPx).toBeGreaterThanOrEqual(13);
  });

  it('gives every name the full halo during a morph', () => {
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5, {}, 0.5)], fullHalo: true }));
    expect(out[0].halo).toBe(1);
    expect(out[0].alpha).toBe(0.5);
  });

  it('gives every name the full halo whenever the view is under 600 px per world unit, and the solved one from 600 up', () => {
    expect(NAME_LUM_PX_PER_WORLD).toBe(600);
    const at = (pxPerWorld: number) => layoutNames(input({ candidates: [cand('a', 700, 400, 5)], pxPerWorld }))[0];
    // Zoomed out past the scale label.lum was measured at: the name covers more gas than was measured.
    for (const scale of [120, 247, 595.8, 599.99]) expect(at(scale).halo, `${scale} px per world unit`).toBe(1);
    // At that scale and closer in, an unmoved name at rest gets the halo solved for its gas (lum 0.4: 0.65).
    for (const scale of [600, 600.01, 900, 1900]) {
      expect([at(scale).x, at(scale).y]).toEqual([700, 400]);
      expect(at(scale).halo, `${scale} px per world unit`).toBe(0.65);
    }
    expect(haloFor(0.4, luminance([240, 236, 228]))).toBe(0.65);
    // On brighter gas the solved halo is stronger, and still the full one under 600.
    const bright = (pxPerWorld: number) => layoutNames(input({ candidates: [cand('b', 700, 400, 5, { lum: 0.9 })], pxPerWorld }))[0].halo;
    expect(bright(600)).toBe(0.75);
    expect(bright(599.99)).toBe(1);
  });

  it('keeps the solved halo below 600 for names drawn smaller than they were measured: down to 600 times their size factor', () => {
    // Zoomed out, names are drawn at 0.85 of the size their gas was measured for (nameZoomK's floor), so the
    // measured box still covers them down to 600 x 0.85 = 510 px per world unit.
    const at = (pxPerWorld: number, zoomK: number) => layoutNames(input({ candidates: [cand('a', 700, 400, 5)], pxPerWorld, zoomK }))[0].halo;
    for (const scale of [510, 510.01, 597, 600, 900]) expect(at(scale, 0.85), `${scale} px per world unit`).toBe(0.65);
    for (const scale of [120, 468, 509.99]) expect(at(scale, 0.85), `${scale} px per world unit`).toBe(1);
    // A name at full size or larger was measured at 600: nothing changes for it.
    expect(at(599.99, 1)).toBe(1);
    expect(at(599.99, 1.2)).toBe(1);
    expect(at(600, 1.2)).toBe(0.65);
  });

  it('at that lowest scale every name of the real theme, with 8 px around it, lies inside the box its gas was measured in', () => {
    const theme = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../public/data/theme/theme.json'), 'utf8')) as { labels: Record<string, ThemeLabel[]> };
    // Tenor Sans capitals run about 0.7 em; widthOf adds the tracking.
    const real = createWidthCache((text) => text.length * 70);
    const k = nameZoomK(0);
    expect(k).toBe(0.85);
    let checked = 0;
    for (const stop of ['sonic', 'balanced', 'mood']) {
      for (const l of theme.labels[stop]) {
        // scripts/theme/bake-core.js labelFontPx and labelBox, in px at 600 px per world unit.
        const fs0 = 0.88 * (l.strong ? 17 + 7 * Math.min(1, Math.sqrt(l.n / 346)) : 15 + 3 * Math.min(1, Math.sqrt(l.n / 346)));
        const measuredW = (0.47 * fs0 * l.name.length + 30) / NAME_LUM_PX_PER_WORLD;
        const measuredH = (0.525 * fs0 + 28) / NAME_LUM_PX_PER_WORLD;
        // The name as layoutNames boxes it, in world units at 600 x 0.85.
        const fontPx = nameFontPx(l, false, k);
        const drawnW = (real.widthOf(l, fontPx) / 2 + 6 + 8) / (NAME_LUM_PX_PER_WORLD * k);
        const drawnH = ((fontPx * 1.05) / 2 + 4 + 8) / (NAME_LUM_PX_PER_WORLD * k);
        expect(drawnW, `${stop} ${l.name} width`).toBeLessThanOrEqual(measuredW);
        expect(drawnH, `${stop} ${l.name} height`).toBeLessThanOrEqual(measuredH);
        checked++;
      }
    }
    expect(checked).toBe(30);
  });

  it('below that, down to 400 times the size factor, solves the halo for the gas of the wider box, and under it gives the full halo', () => {
    expect(NAME_LUM_WIDE_PX_PER_WORLD).toBe(400);
    // lum 0.4 solves to 0.65, the wider box's 0.9 to 0.75.
    const wide = { lumWide: 0.9 };
    const at = (pxPerWorld: number, zoomK: number, extra: Partial<ThemeLabel> = wide) => layoutNames(input({ candidates: [cand('a', 700, 400, 5, extra)], pxPerWorld, zoomK }))[0].halo;
    expect(haloFor(0.9, luminance([240, 236, 228]))).toBe(0.75);
    // The Whole map on a laptop: names at 0.85 of their size, 340 to 510 px per world unit.
    for (const scale of [340, 340.01, 478, 498, 509.99]) expect(at(scale, 0.85), `${scale} px per world unit`).toBe(0.75);
    for (const scale of [120, 300, 339.99]) expect(at(scale, 0.85), `${scale} px per world unit`).toBe(1);
    // From 510 up the first box holds the name: its own, lighter halo, as before.
    for (const scale of [510, 597, 900]) expect(at(scale, 0.85), `${scale} px per world unit`).toBe(0.65);
    // A name at full size: the wider box from 400, the first from 600.
    expect(at(399.99, 1)).toBe(1);
    expect(at(400, 1)).toBe(0.75);
    expect(at(599.99, 1)).toBe(0.75);
    expect(at(600, 1)).toBe(0.65);
    // A name drawn larger covers more map: the wider box holds it only from 400 times its size.
    expect(at(479.99, 1.2)).toBe(1);
    expect(at(480, 1.2)).toBe(0.75);
    expect(at(599.99, 1.2)).toBe(0.75);
    expect(at(600, 1.2)).toBe(0.65);
    // A phone and a slider morph keep the full halo at any scale.
    expect(layoutNames(input({ candidates: [cand('a', 700, 400, 5, wide)], pxPerWorld: 478, zoomK: 0.85, fullHalo: true }))[0].halo).toBe(1);
  });

  it('a theme baked before the wider box (no lumWide) keeps the full halo under 510, as it did', () => {
    const at = (pxPerWorld: number, zoomK: number) => layoutNames(input({ candidates: [cand('a', 700, 400, 5)], pxPerWorld, zoomK }))[0].halo;
    expect(label('a', 1).lumWide).toBeUndefined();
    for (const scale of [340, 400, 478, 498, 509.99]) expect(at(scale, 0.85), `${scale} px per world unit`).toBe(1);
    expect(at(510, 0.85)).toBe(0.65);
    expect(at(599.99, 1)).toBe(1);
    // The loader lets any lumWide through: anything but a number counts as missing.
    for (const bad of [null, '0.4', Number.NaN, Number.POSITIVE_INFINITY]) {
      const h = layoutNames(input({ candidates: [cand('a', 700, 400, 5, { lumWide: bad as never })], pxPerWorld: 478, zoomK: 0.85 }))[0].halo;
      expect(h, String(bad)).toBe(1);
    }
  });

  it('never solves the wider box for less gas than the first one (a wider value below lum is not believed)', () => {
    const h = layoutNames(input({ candidates: [cand('a', 700, 400, 5, { lum: 0.9, lumWide: 0.1 })], pxPerWorld: 478, zoomK: 0.85 }))[0].halo;
    expect(h).toBe(0.75);
  });

  it('across that range every name of the real theme, with 8 px around it, lies inside the wider box its gas was measured in', () => {
    const theme = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../public/data/theme/theme.json'), 'utf8')) as { labels: Record<string, ThemeLabel[]> };
    // Tenor Sans capitals run about 0.7 em; widthOf adds the tracking.
    const real = createWidthCache((text) => text.length * 70);
    let checked = 0;
    // Every size factor a name can be drawn at (nameZoomK's range), each from the lowest scale the wider box is
    // used at (400 times the factor) up to where the first box takes over.
    for (const k of [0.85, 0.9, 1, 1.2, 1.35]) {
      const lowest = NAME_LUM_WIDE_PX_PER_WORLD * k;
      const takeover = NAME_LUM_PX_PER_WORLD * Math.min(1, k);
      for (const scale of [lowest, lowest + 0.01, (lowest + takeover) / 2, takeover - 0.01]) {
        for (const stop of ['sonic', 'balanced', 'mood']) {
          for (const l of theme.labels[stop]) {
            expect(l.lumWide, `${stop} ${l.name} has the wider measurement`).toBeGreaterThanOrEqual(l.lum);
            // scripts/theme/bake-core.js labelFontPx and labelBox at LABEL_WIDE_PPW, in world units.
            const fs0 = 0.88 * (l.strong ? 17 + 7 * Math.min(1, Math.sqrt(l.n / 346)) : 15 + 3 * Math.min(1, Math.sqrt(l.n / 346)));
            const measuredW = (0.47 * fs0 * l.name.length + 30) / NAME_LUM_WIDE_PX_PER_WORLD;
            const measuredH = (0.525 * fs0 + 28) / NAME_LUM_WIDE_PX_PER_WORLD;
            // The name as layoutNames boxes it, in world units at this scale.
            const fontPx = nameFontPx(l, false, k);
            const drawnW = (real.widthOf(l, fontPx) / 2 + 6 + 8) / scale;
            const drawnH = ((fontPx * 1.05) / 2 + 4 + 8) / scale;
            expect(drawnW, `${stop} ${l.name} width at ${scale} (size ${k})`).toBeLessThanOrEqual(measuredW);
            expect(drawnH, `${stop} ${l.name} height at ${scale} (size ${k})`).toBeLessThanOrEqual(measuredH);
            // And layoutNames does use the wider box there for this label.
            const placed = layoutNames(input({ candidates: [{ key: nameKey('balanced', l.id), label: l, x: 700, y: 400, alpha: 1 }], blockers: [], pxPerWorld: scale, zoomK: k, widthOf: real.widthOf }))[0];
            expect(placed.halo, `${stop} ${l.name} halo at ${scale}`).toBe(haloFor(l.lumWide as number, luminance(l.rgb), l.strong ? 1 : 0.82));
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(30 * 5 * 4);
    // The scales the app reaches with the wider box are inside what was just checked: under 510 the size factor is 0.85.
    for (const scale of [340, 400, 478, 498, 509.99]) expect(nameZoomK(0.0068 * scale)).toBe(0.85);
  });

  it('says which spot each name took: 0 on its own point, else the nudge', () => {
    const out = layoutNames(input({ candidates: [cand('a', 700, 400, 5), cand('b', 705, 405, 9)] }));
    expect(out[0].spot).toBe(0);
    expect(out[1].spot).toBeGreaterThan(0);
    expect([out[1].x - 700, out[1].y - 400]).toEqual([...NAME_OFFSETS[out[1].spot]]);
  });

  it('a nudged name keeps a solved halo while it is still inside the box its gas was measured in, and the full one outside', () => {
    const wide = { lumWide: 0.9 };
    // 'Playful Way' at 478 px per world unit, size 0.85: the wider box is about 46 px half high, the first 31.
    const at = (spot: number, pxPerWorld: number, zoomK: number, extra: Partial<ThemeLabel> = wide, over: Partial<NamesInput> = {}) => {
      const sticky = new Map([[nameKey('balanced', 'a'), spot]]);
      const p = layoutNames(input({ candidates: [cand('a', 700, 400, 5, extra)], blockers: [], pxPerWorld, zoomK, sticky, ...over }))[0];
      expect(p.spot).toBe(spot);
      return p.halo;
    };
    // 22 px up or down, 40 px left or right: inside the wider box, so its halo (lumWide 0.9: 0.75).
    for (const spot of [1, 2, 3, 4]) expect(at(spot, 478, 0.85), `spot ${spot}`).toBe(0.75);
    // 46 px and more: outside it.
    for (const spot of [5, 6, 7, 8, 9, 10, 11, 12]) expect(at(spot, 478, 0.85), `spot ${spot}`).toBe(1);
    // Closer in the same px are less map: at 900 the 22 px nudge is inside the first box (lum 0.4: 0.65), the 46 px one inside the wider.
    expect(at(1, 900, 0.85)).toBe(0.65);
    expect(at(5, 900, 0.85)).toBe(0.75);
    expect(at(11, 900, 0.85)).toBe(1);
    // Inside only the wider box and the theme has none: full.
    expect(at(1, 478, 0.85, {})).toBe(1);
    expect(at(1, 900, 0.85, {})).toBe(0.65);
    // A phone and a morph: full, nudged or not.
    expect(at(1, 900, 0.85, wide, { fullHalo: true })).toBe(1);
  });

  it('for every name of the real theme, on every spot and at every scale, a halo under the full one is solved for a box that holds the name with 8 px around it', () => {
    const theme = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../public/data/theme/theme.json'), 'utf8')) as { labels: Record<string, ThemeLabel[]> };
    const bake = (globalThis as unknown as { RMR_THEME: { GAS: { LABEL_REF_PPW: number; LABEL_WIDE_PPW: number }; labelBox: (name: string, strong: boolean, n: number, s: number, ppw?: number) => [number, number] } }).RMR_THEME;
    expect([bake.GAS.LABEL_REF_PPW, bake.GAS.LABEL_WIDE_PPW]).toEqual([NAME_LUM_PX_PER_WORLD, NAME_LUM_WIDE_PX_PER_WORLD]);
    // Tenor Sans capitals run about 0.7 em; widthOf adds the tracking.
    const real = createWidthCache((text) => text.length * 70);
    let solvedNudged = 0;
    let fullNudged = 0;
    let checked = 0;
    for (const scale of [200, 339.99, 340, 400, 478.4, 498.1, 509.99, 510, 596.7, 600, 686.2, 900, 1300, 1900]) {
      // The size the app draws names at for this scale.
      const k = nameZoomK(0.0068 * scale);
      for (const stop of ['sonic', 'balanced', 'mood']) {
        for (const l of theme.labels[stop]) {
          const key = nameKey('balanced', l.id);
          // The boxes the build measured lum and lumWide in (scripts/theme/bake-core.js labelBox), in px at this scale.
          const [lw, lh] = bake.labelBox(l.name, l.strong, l.n, 1).map((v) => v * scale);
          const [ww, wh] = bake.labelBox(l.name, l.strong, l.n, 1, bake.GAS.LABEL_WIDE_PPW).map((v) => v * scale);
          const alpha = l.strong ? 1 : 0.82;
          const haloLum = haloFor(l.lum, luminance(l.rgb), alpha);
          const haloWide = haloFor(l.lumWide as number, luminance(l.rgb), alpha);
          for (let spot = 0; spot < NAME_OFFSETS.length; spot++) {
            const p = layoutNames(input({ candidates: [{ key, label: l, x: 2000, y: 2000, alpha: 1 }], visible: { left: 0, top: 0, right: 4000, bottom: 4000 }, blockers: [], pxPerWorld: scale, zoomK: k, widthOf: real.widthOf, sticky: new Map([[key, spot]]) }))[0];
            expect(p.spot).toBe(spot);
            // The drawn name with 8 px around it, from the label's point.
            const reachX = Math.abs(p.x - 2000) + real.widthOf(l, p.fontPx) / 2 + 8;
            const reachY = Math.abs(p.y - 2000) + (p.fontPx * 1.05) / 2 + 8;
            const inLum = reachX <= lw && reachY <= lh;
            const inWide = reachX <= ww && reachY <= wh;
            const why = `${stop} ${l.name} spot ${spot} at ${scale}`;
            if (p.halo < 1) expect((inLum && p.halo >= haloLum) || (inWide && p.halo >= haloWide), why).toBe(true);
            if (spot > 0 && p.halo < 1) solvedNudged++;
            else if (spot > 0) fullNudged++;
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(14 * 30 * 13);
    expect(solvedNudged).toBeGreaterThan(300);
    expect(fullNudged).toBeGreaterThan(300);
  });

  it('returns nothing for a stop with no labels', () => {
    expect(layoutNames(input({ candidates: [] }))).toEqual([]);
  });

  it('returns nothing when no name fits (a very narrow or very short map)', () => {
    expect(layoutNames(input({ candidates: [cand('a', 60, 40, 5)], visible: { left: 0, top: 0, right: 120, bottom: 80 }, blockers: [] }))).toEqual([]);
    expect(layoutNames(input({ candidates: [cand('a', 700, 20, 5)], visible: { left: 0, top: 0, right: 1440, bottom: 40 }, blockers: [] }))).toEqual([]);
  });
});

describe('chromeBlockers', () => {
  it('covers the slider card, the taller zoom corner (toggle plus zoom stack) and the hint line on desktop', () => {
    const b = chromeBlockers(DESKTOP);
    expect(b).toContainEqual({ left: 12, top: 12, right: 272, bottom: 154 });
    expect(b).toContainEqual({ left: 1440 - 68, top: 836 - 196, right: 1440, bottom: 836 });
    expect(b).toContainEqual({ left: 0, top: 836 - 46, right: 380, bottom: 836 });
    expect(b).toHaveLength(3);
  });

  it('follows the album panel while it slides away, and swaps the hint for the card', () => {
    const b = chromeBlockers({ ...DESKTOP, inset: 648 });
    expect(b).toContainEqual({ left: 660, top: 12, right: 920, bottom: 154 });
    expect(b).toContainEqual({ left: 648, top: 836 - 46, right: 648 + 380, bottom: 836 });
    const withCard = chromeBlockers({ ...DESKTOP, card: true });
    expect(withCard).toContainEqual({ left: 12, top: 836 - 200, right: 428, bottom: 836 });
    expect(withCard).not.toContainEqual({ left: 0, top: 836 - 46, right: 380, bottom: 836 });
  });

  it('covers the bottom slider and the zoom corner above it on a phone', () => {
    const b = chromeBlockers({ width: 390, height: 780, top: 0, inset: 0, phone: true, bottomCover: 165, card: false });
    expect(b).toContainEqual({ left: 0, top: 780 - 165 - 10, right: 390, bottom: 780 });
    expect(b).toContainEqual({ left: 390 - 64, top: 780 - 165 - 200, right: 390, bottom: 780 - 165 });
    expect(b).toHaveLength(2);
  });

  it('moves the controls at the top down by the header cover, and leaves the ones at the bottom alone', () => {
    // A stage that runs under a 64 px header is 900 px tall on a 1440 x 900 window.
    const b = chromeBlockers({ ...DESKTOP, height: 900, top: 64 });
    expect(b).toContainEqual({ left: 12, top: 76, right: 272, bottom: 218 });
    expect(b).toContainEqual({ left: 1440 - 68, top: 900 - 196, right: 1440, bottom: 900 });
    expect(b).toContainEqual({ left: 0, top: 900 - 46, right: 380, bottom: 900 });
  });
});

describe('createWidthCache', () => {
  it('measures a name once at 100 px, adds the tracking and scales', () => {
    let calls = 0;
    const cache = createWidthCache((text) => {
      calls++;
      expect(text).toBe('PLAYFUL WAY');
      return 620;
    });
    expect(cache.widthOf(label('a', 1), 20)).toBeCloseTo(((620 + 100 * 0.26 * 11) * 20) / 100, 6);
    cache.widthOf(label('a', 1), 16);
    expect(calls).toBe(1);
  });

  it('measures again after clear (the face arrived after the first measurement)', () => {
    let width = 500;
    const cache = createWidthCache(() => width);
    const before = cache.widthOf(label('a', 1), 20);
    width = 620;
    expect(cache.widthOf(label('a', 1), 20)).toBe(before);
    cache.clear();
    expect(cache.widthOf(label('a', 1), 20)).toBeGreaterThan(before);
  });
});
