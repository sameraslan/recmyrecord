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

  it('has a stand-in picture per stop: a small opaque WebP in the shape of the stop\'s gas image, sky at its edges', async () => {
    for (const stop of STOP_IDS) {
      const uri = PICTURES[stop];
      expect(uri.startsWith('data:image/webp;base64,'), stop).toBe(true);
      const bytes = Buffer.from(uri.slice('data:image/webp;base64,'.length), 'base64');
      // one to three kilobytes each, as the page carries one inline
      expect(bytes.length, stop).toBeGreaterThanOrEqual(1024);
      expect(bytes.length, stop).toBeLessThanOrEqual(3072);
      const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      expect(info.channels, stop).toBe(3);
      expect(Math.max(info.width, info.height), stop).toBe(192);
      const [w, h] = theme.gas[stop].px;
      expect(info.width / info.height, stop).toBeCloseTo(w / h, 1);
      // the corners are the map's sky, rgb(6, 6, 9), so the picture has no visible box; the middle is lit
      for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1]]) {
        const o = 3 * (y * info.width + x);
        expect(Math.max(Math.abs(data[o] - 6), Math.abs(data[o + 1] - 6), Math.abs(data[o + 2] - 9)), `${stop} corner ${x},${y}`).toBeLessThanOrEqual(6);
      }
      const mid = 3 * (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2));
      expect(data[mid] + data[mid + 1] + data[mid + 2], stop).toBeGreaterThan(90);
      const tone = THEME_BAKE.stops[stop].tone;
      expect(tone.every((v) => v > 30 && v < 200), stop).toBe(true);
    }
  });
});
