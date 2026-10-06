import { describe, expect, it } from 'vitest';
import type { ThemeLabel } from '@/lib/data/theme';
import { NAMES_BAND_PX } from '../theme';
import { COVER_FADE_START_PX } from './zoomLimits';
import {
  NAMES_MAX_PHONE,
  NAME_EDGE_PX,
  NAME_LUM_PX_PER_WORLD,
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
