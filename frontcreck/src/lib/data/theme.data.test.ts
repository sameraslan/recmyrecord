import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOP_IDS } from '@/lib/types';
import { isTheme, type ThemeData } from './theme';

// vitest runs from frontcreck/, like the build-time data access in server.ts
const DATA = path.resolve(process.cwd(), 'public/data');
const read = (name: string): Buffer => fs.readFileSync(path.join(DATA, name));
const theme = (): ThemeData => JSON.parse(read('theme/theme.json').toString('utf8')) as ThemeData;

describe('committed theme data (public/data/theme)', () => {
  it('has the shape the loader accepts', () => {
    expect(isTheme(theme())).toBe(true);
  });

  it('was built for the committed albums and layouts (run npm run theme after either changes)', () => {
    const t = theme();
    const albums = JSON.parse(read('albums.json').toString('utf8')) as unknown[];
    expect(t.n).toBe(albums.length);
    expect(t.positionsHash).toBe(crypto.createHash('sha256').update(read('positions.json')).digest('hex').slice(0, 12));
  });

  it('names regions at every stop, inside the baked square, with light ink', () => {
    const t = theme();
    expect(STOP_IDS.map((s) => t.labels[s].length)).toEqual([7, 17, 6]);
    for (const s of STOP_IDS) {
      for (const l of t.labels[s]) {
        expect(Math.max(Math.abs(l.x), Math.abs(l.y)), l.id).toBeLessThan(t.bakeHalf);
        expect(Math.min(...l.rgb), l.id).toBeGreaterThanOrEqual(204);
        expect(l.lum, l.id).toBeGreaterThan(0);
        expect(l.lum, l.id).toBeLessThanOrEqual(1);
      }
    }
  });

  it('colours most stars and sees gas behind most of them', () => {
    const t = theme();
    const led = t.stars.lead.filter((v) => v >= 0).length;
    expect(led).toBeGreaterThan(t.n * 0.6);
    const lit = t.stars.bg.filter((v) => v > 2).length; // the empty sky is 1 of 255
    expect(lit).toBeGreaterThan(t.stars.bg.length * 0.8);
  });

  it.each(STOP_IDS)('has a 2048 px WebP with a dust channel for %s', (stop) => {
    const b = read(`theme/gas-${stop}.webp`);
    expect(b.toString('latin1', 0, 4)).toBe('RIFF');
    expect(b.toString('latin1', 8, 16)).toBe('WEBPVP8X');
    expect(b[20] & 0x10, 'alpha flag').toBe(0x10);
    expect(1 + b.readUIntLE(24, 3)).toBe(2048);
    expect(1 + b.readUIntLE(27, 3)).toBe(2048);
    expect(b.length).toBeLessThan(1_500_000);
  });

  it('keeps theme.json under 80 KB on disk, since every map visit loads it', () => {
    expect(read('theme/theme.json').length).toBeLessThan(80_000);
  });
});
