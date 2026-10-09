import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizePositions, positionsTransform, rawToWorld } from '@/components/map/data';
import { overviewExtent, percentileBounds } from '@/components/map/state/bounds';
import { STOP_IDS, type Positions } from '@/lib/types';
import { readTheme, type ThemeData } from './theme';
import { GAS_PLACEHOLDER_BALANCED, GAS_PLACEHOLDER_MOOD, GAS_PLACEHOLDER_SONIC, THEME_BAKE } from './theme.generated';

const DATA = path.resolve(process.cwd(), 'public/data');
const theme = readTheme(JSON.parse(fs.readFileSync(path.join(DATA, 'theme/theme.json'), 'utf8'))) as ThemeData;
const positions = JSON.parse(fs.readFileSync(path.join(DATA, 'positions.json'), 'utf8')) as Positions;
const PICTURES = { sonic: GAS_PLACEHOLDER_SONIC, balanced: GAS_PLACEHOLDER_BALANCED, mood: GAS_PLACEHOLDER_MOOD };

describe('theme.generated.ts (what the page knows of the theme before theme.json arrives)', () => {
  it('is of the committed theme: the same albums, layouts and image names', () => {
    expect(THEME_BAKE.n).toBe(theme.n);
    expect(THEME_BAKE.positionsHash).toBe(theme.positionsHash);
    for (const stop of STOP_IDS) {
      expect([...THEME_BAKE.stops[stop].hash], stop).toEqual(theme.gas[stop].hash);
      // the image a page would ask for early is a file that exists
      expect(fs.existsSync(path.join(DATA, `theme/gas-${stop}.${THEME_BAKE.stops[stop].hash[0]}.webp`)), stop).toBe(true);
    }
  });

  it('holds, per stop, what the map itself fits its opening views to and where it draws the gas', () => {
    const tx = positionsTransform(positions);
    const pos = normalizePositions(positions, tx);
    for (const stop of STOP_IDS) {
      const b = THEME_BAKE.stops[stop];
      // The Whole map: the full extent of the stop's albums (state/bounds.ts getCloudBounds at the stop).
      const cloud = percentileBounds(pos[stop], 0, 1);
      for (const [i, v] of [cloud.minX, cloud.minY, cloud.maxX, cloud.maxY].entries()) expect(b.cloud[i], `${stop} cloud ${i}`).toBeCloseTo(v, 4);
      // The Overview: the 1st to 99th percentile span and the median row.
      const ext = overviewExtent(pos[stop]);
      for (const [i, v] of [ext.x1, ext.x99, ext.medY].entries()) expect(b.span[i], `${stop} span ${i}`).toBeCloseTo(v, 4);
      // The gas image's rectangle (theme.json, raw units) in the map's world units.
      const [west, south, east, north] = theme.gas[stop].rect;
      const sw = rawToWorld({ tx }, west, south);
      const ne = rawToWorld({ tx }, east, north);
      for (const [i, v] of [sw[0], sw[1], ne[0], ne[1]].entries()) expect(b.gas[i], `${stop} gas ${i}`).toBeCloseTo(v, 4);
    }
  });

  it('has a stand-in picture per stop: a small WebP in the shape of the stop\'s gas image, fading to the pane\'s colour and see-through at its very edges', async () => {
    for (const stop of STOP_IDS) {
      const uri = PICTURES[stop];
      expect(uri.startsWith('data:image/webp;base64,'), stop).toBe(true);
      const bytes = Buffer.from(uri.slice('data:image/webp;base64,'.length), 'base64');
      // one to two kilobytes each, as the page carries one inline
      expect(bytes.length, stop).toBeGreaterThanOrEqual(1024);
      expect(bytes.length, stop).toBeLessThanOrEqual(2048);
      const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      expect(info.channels, stop).toBe(4);
      expect(Math.max(info.width, info.height), stop).toBe(128);
      const [w, h] = theme.gas[stop].px;
      expect(info.width / info.height, stop).toBeCloseTo(w / h, 1);
      // Every texel of its four edges is fully see-through, so the pane itself shows there and the picture's box
      // cannot show as a step (a lossy picture's own edge was a level off the pane's colour); just inside, where it
      // is opaque, it is within a few levels of the pane's colour, rgb(7, 6, 10).
      let edge = 0;
      let near = 0;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const o = 4 * (y * info.width + x);
          if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) edge = Math.max(edge, data[o + 3]);
          const r = Math.hypot((x + 0.5 - info.width / 2) / (info.width / 2), (y + 0.5 - info.height / 2) / (info.height / 2));
          if (r > 0.9 && r < 0.95) near = Math.max(near, Math.abs(data[o] - 7), Math.abs(data[o + 1] - 6), Math.abs(data[o + 2] - 10));
        }
      }
      expect(edge, `${stop}: alpha at the edges`).toBe(0);
      expect(near, `${stop}: levels off the pane's colour just inside the rim`).toBeLessThanOrEqual(8);
      // Nothing as fine as a texel is left in it: no texel differs from the mean of its two neighbours, along a row
      // or a column, by more than 8 levels of 255 (a picture softened by one texel, not three, has kinks of over 20), so the browser's enlargement of it shows no grid.
      let kink = 0;
      for (let y = 1; y < info.height - 1; y++) {
        for (let x = 1; x < info.width - 1; x++) {
          for (let c = 0; c < 3; c++) {
            const at = (dx: number, dy: number) => data[4 * ((y + dy) * info.width + x + dx) + c];
            kink = Math.max(kink, Math.abs(at(0, 0) - (at(-1, 0) + at(1, 0)) / 2), Math.abs(at(0, 0) - (at(0, -1) + at(0, 1)) / 2));
          }
        }
      }
      expect(kink, `${stop}: the sharpest texel`).toBeLessThanOrEqual(8);
      const mid = 4 * (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2));
      expect(data[mid] + data[mid + 1] + data[mid + 2], stop).toBeGreaterThan(90);
      expect(data[mid + 3], stop).toBe(255);
      // Its mean tone, and the mean colours of its warm and its cool side (the album page's wash): red leads the
      // one, blue the other.
      const { tone, warm, cool } = THEME_BAKE.stops[stop];
      for (const t of [tone, warm, cool]) expect(t.every((v) => v > 30 && v < 200), stop).toBe(true);
      expect(warm[0], stop).toBeGreaterThan(warm[2]);
      expect(cool[2], stop).toBeGreaterThan(cool[0]);
    }
  });
});
