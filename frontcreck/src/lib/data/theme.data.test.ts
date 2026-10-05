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

  /** Width, height and alpha flag of a WebP in the extended format (the one with an alpha channel). */
  const webp = (b: Buffer) => {
    expect(b.toString('latin1', 0, 4)).toBe('RIFF');
    expect(b.toString('latin1', 8, 16)).toBe('WEBPVP8X');
    return { alpha: (b[20] & 0x10) === 0x10, size: [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)] };
  };

  const sha = (b: Buffer): string => crypto.createHash('sha256').update(b).digest('hex').slice(0, 10);

  it('names every gas image after its own bytes, and holds no other gas image (/data is cached for a day)', () => {
    const t = theme();
    const named = STOP_IDS.flatMap((s) => [`gas-${s}.${t.gas[s].hash[0]}.webp`, `gas-${s}-sharp.${t.gas[s].hash[1]}.webp`]);
    // a name without its hash, or an image of an earlier bake, must not be left behind
    expect(fs.readdirSync(path.join(DATA, 'theme')).filter((f) => f.endsWith('.webp')).sort()).toEqual([...named].sort());
    for (const s of STOP_IDS) {
      expect(sha(read(`theme/gas-${s}.${t.gas[s].hash[0]}.webp`)), `${s} first`).toBe(t.gas[s].hash[0]);
      expect(sha(read(`theme/gas-${s}-sharp.${t.gas[s].hash[1]}.webp`)), `${s} sharp`).toBe(t.gas[s].hash[1]);
    }
  });

  it.each(STOP_IDS)('has the first image of %s: WebP with a dust channel, 2048 px on its longer side, under 400 KB', (stop) => {
    const g = theme().gas[stop];
    const b = read(`theme/gas-${stop}.${g.hash[0]}.webp`);
    const w = webp(b);
    expect(w.alpha, 'alpha flag').toBe(true);
    expect(w.size).toEqual(g.px);
    expect(Math.max(...g.px)).toBe(2048);
    // Every map visit downloads one of these before the nebula shows (188 KB at the old quality of 84, which
    // smeared the fine swirl). 400 KB is the agreed ceiling; over it, lower the quality or the size on purpose.
    expect(b.length).toBeLessThan(400_000);
    // and not so small that the quality was turned down again without anyone looking (0.5 bits a pixel)
    expect(b.length).toBeGreaterThan((g.px[0] * g.px[1]) / 16);
  });

  it.each(STOP_IDS)('has the sharper image of %s: the prototype\'s texels per raw unit over the same rectangle, under 1 MB', (stop) => {
    const t = theme();
    const g = t.gas[stop];
    const b = read(`theme/gas-${stop}-sharp.${g.hash[1]}.webp`);
    const w = webp(b);
    expect(w.alpha, 'alpha flag').toBe(true);
    expect(w.size).toEqual(g.sharp);
    expect(Math.max(...g.sharp)).toBeLessThanOrEqual(4096);
    const perRaw = 4096 / (2 * t.bakeHalf);
    expect(g.sharp[0] / (g.rect[2] - g.rect[0])).toBeCloseTo(perRaw, 0);
    expect(g.sharp[1] / (g.rect[3] - g.rect[1])).toBeCloseTo(perRaw, 0);
    // fetched at idle by desktops only; the agreed ceiling is 1.5 MB
    expect(b.length).toBeLessThan(1_000_000);
    expect(b.length).toBeGreaterThan((g.sharp[0] * g.sharp[1]) / 16);
  });

  it('keeps every album and every name inside its stop\'s gas rectangle, with the padding to spare', () => {
    const t = theme();
    const positions = JSON.parse(read('positions.json').toString('utf8')) as Record<string, number[]>;
    for (const s of STOP_IDS) {
      const [x0, y0, x1, y1] = t.gas[s].rect;
      const p = positions[s];
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0 + 0.06 || p[i] > x1 - 0.06 || p[i + 1] < y0 + 0.06 || p[i + 1] > y1 - 0.06) throw new Error(`${s}: album ${i / 2} at ${p[i]}, ${p[i + 1]} is outside the gas rectangle`);
      }
      for (const l of t.labels[s]) expect(l.x > x0 && l.x < x1 && l.y > y0 && l.y < y1, l.id).toBe(true);
    }
  });

  it('stays inside the GPU memory budgets (RGBA with mips: 4 bytes a px, times 4/3)', () => {
    const t = theme();
    const mb = ([w, h]: number[]) => (w * h * 4 * (4 / 3)) / 2 ** 20;
    const first = STOP_IDS.reduce((sum, s) => sum + mb(t.gas[s].px), 0);
    const sharpest = Math.max(...STOP_IDS.map((s) => mb(t.gas[s].sharp)));
    // phones and every other device that keeps to the first images: no more than three 2048 px squares (64 MB)
    expect(first).toBeLessThanOrEqual(3 * mb([2048, 2048]));
    // desktops: the three first images and one sharper image at a time
    expect(first + sharpest).toBeLessThanOrEqual(135);
  });

  it('keeps theme.json under 80 KB on disk, since every map visit loads it', () => {
    expect(read('theme/theme.json').length).toBeLessThan(80_000);
  });
});
