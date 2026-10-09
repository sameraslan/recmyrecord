import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAS_GLOW, GAS_SKY } from '../../src/components/map/shaders/gas.ts';
import { GLOW, GRAIN_DOWN, GRAIN_PX, GRAIN_UP, PLACEHOLDER_MAX_BYTES, PLACEHOLDER_PX, SKY, feather, grainPixels, grainUri, shownColour, stopFraming, themeModule, worldRect } from './build-module.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

describe('build-module (theme.generated.ts)', () => {
  it('tones the stand-in with the map\'s own sky and glow', () => {
    expect(SKY).toEqual(GAS_SKY);
    expect(GLOW).toBe(GAS_GLOW);
  });

  it('shows no gas as the sky, and gas under dust as less light, never more', () => {
    const sky = SKY.map((v) => Math.round(v * 255));
    // no gas: the sky, whatever the dust channel says
    expect(shownColour(0, 0, 0, 255)).toEqual(sky);
    expect(shownColour(0, 0, 0, 51)).toEqual(sky);
    // gas with no dust over it: its light times 1 + GLOW, on the sky
    expect(shownColour(128, 128, 128, 255)).toEqual(sky.map((s, c) => Math.round((SKY[c] + (128 / 255) * (1 + GLOW)) * 255)));
    // the same gas under dust is darker in every channel, and still not under the sky
    const clear = shownColour(200, 150, 90, 255);
    const dusty = shownColour(200, 150, 90, 80);
    for (let c = 0; c < 3; c++) {
      expect(dusty[c]).toBeLessThan(clear[c]);
      expect(dusty[c]).toBeGreaterThanOrEqual(sky[c]);
    }
    // white gas does not overflow
    expect(Math.max(...shownColour(255, 255, 255, 255))).toBe(255);
  });

  it('reads a layout\'s extents with the app\'s quantile rule, in world units', () => {
    // 101 points on a line: x = i, y = 2 i, in raw units; world = (raw - 50) * 0.01 on x, (raw - 100) * 0.01 on y
    const raw = [];
    for (let i = 0; i <= 100; i++) raw.push(i, 2 * i);
    const f = stopFraming(raw, { cx: 50, cy: 100, s: 0.01 });
    expect(f.cloud).toEqual([-0.5, -1, 0.5, 1]);
    // sorted[floor(q * (n - 1))]: the 1st and 99th of 101 are the points 1 and 99, the median the point 50
    expect(f.span).toEqual([-0.49, 0.49, 0]);
    expect(worldRect([40, 90, 60, 120], { cx: 50, cy: 100, s: 0.01 })).toEqual([-0.1, -0.1, 0.1, 0.2]);
  });

  it('the committed module is what the committed data gives (run npm run theme:module), with stand-ins of one to three kilobytes', async () => {
    const made = await themeModule(path.join(ROOT, 'public/data'));
    expect(fs.readFileSync(path.join(ROOT, 'src/lib/data/theme.generated.ts'), 'utf8')).toBe(made.text);
    for (const stop of ['sonic', 'balanced', 'mood']) {
      const p = made.pictures[stop];
      expect(p.bytes.length, stop).toBeGreaterThanOrEqual(1024);
      expect(p.bytes.length, stop).toBeLessThanOrEqual(PLACEHOLDER_MAX_BYTES);
      expect(Math.max(...p.size), stop).toBe(PLACEHOLDER_PX);
      // the round fade takes next to none of the nebula's light: the stand-in is no dimmer for it
      expect(p.lost, stop).toBeLessThan(0.01);
    }
  });

  it('the grain over the stand-in is the tile in the stylesheet: a quarter of its pixels a touch lighter, a quarter a touch darker, the rest untouched', async () => {
    const px = grainPixels();
    const counts = { up: 0, down: 0, none: 0 };
    for (let i = 0; i < GRAIN_PX * GRAIN_PX; i++) {
      const [v, a] = [px[4 * i], px[4 * i + 3]];
      if (a === 0) counts.none++;
      else if (v === 255 && a === GRAIN_UP) counts.up++;
      else if (v === 0 && a === GRAIN_DOWN) counts.down++;
      else throw new Error(`a grain pixel of value ${v} at alpha ${a}`);
    }
    const n = GRAIN_PX * GRAIN_PX;
    expect(counts.up / n).toBeGreaterThan(0.22);
    expect(counts.up / n).toBeLessThan(0.28);
    expect(counts.down / n).toBeGreaterThan(0.22);
    expect(counts.down / n).toBeLessThan(0.28);
    // Too faint to see as noise, and next to neutral: over the pane's colour (about 7 of 255) a lighter pixel adds
    // GRAIN_UP levels and a darker one takes nothing, so the pane rises by under a level on average; over a
    // mid-bright picture (120) the two cancel to within a third of a level.
    expect(GRAIN_UP).toBeLessThanOrEqual(3);
    expect(GRAIN_DOWN).toBeLessThanOrEqual(5);
    const shift = (base) => (counts.up * (255 - base) * (GRAIN_UP / 255) - counts.down * base * (GRAIN_DOWN / 255)) / n;
    expect(shift(7)).toBeLessThan(1);
    expect(Math.abs(shift(120))).toBeLessThan(0.35);
    // The stylesheet holds this tile, at its own size, on the stand-in's own layer.
    const uri = await grainUri();
    expect(uri.length).toBeLessThan(2048);
    const css = fs.readFileSync(path.join(ROOT, 'src/styles/map.css'), 'utf8');
    expect(css).toContain(`.gas-ph::after { content: ""; position: absolute; inset: 0; background: url("${uri}") 0 0 / ${GRAIN_PX}px ${GRAIN_PX}px; }`);
  });

  it('a stand-in keeps none of its light at its edges and in its corners, all of it in the middle, along a round rim', () => {
    const [w, h] = [106, 128];
    // every edge texel, and the corners well inside the edges, are gone
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) expect(feather(x, y, w, h)).toBe(0);
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) expect(feather(x, y, w, h)).toBe(0);
    for (const [x, y] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) expect(feather(x, y, w, h)).toBe(0);
    expect(feather(53, 64, w, h)).toBe(1);
    expect(feather(Math.round(w * 0.3), Math.round(h * 0.3), w, h)).toBe(1);
    // rising all the way in from an edge, in steps no texel-wide jump could hide in
    let last = 0;
    for (let x = 0; x <= 18; x++) {
      const a = feather(x, 64, w, h);
      expect(a).toBeGreaterThanOrEqual(last);
      expect(a - last).toBeLessThan(0.25);
      last = a;
    }
    expect(last).toBe(1);
    // the same amount at the same distance from the middle, whichever way: the fade is round, not a frame
    expect(feather(w - 1 - 5, 64, w, h)).toBeCloseTo(feather(5, 63, w, h), 6);
    const along = feather(5, 64, w, h); // 5 texels in from the left edge, mid height
    expect(feather(5, 26, w, h), 'nearer a corner at the same distance from the edge: more faded').toBeLessThan(along);
  });
});
