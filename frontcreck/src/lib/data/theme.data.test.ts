import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { STOP_IDS } from '@/lib/types';
import { readTheme, type ThemeData } from './theme';

// vitest runs from frontcreck/, like the build-time data access in server.ts
const DATA = path.resolve(process.cwd(), 'public/data');
const read = (name: string): Buffer => fs.readFileSync(path.join(DATA, name));
const theme = (): ThemeData => readTheme(JSON.parse(read('theme/theme.json').toString('utf8'))) as ThemeData;

describe('committed theme data (public/data/theme)', () => {
  it('has the shape the loader accepts', () => {
    expect(theme()).not.toBeNull();
  });

  it('was built for the committed albums and layouts (run npm run theme after either changes)', () => {
    const t = theme();
    const albums = JSON.parse(read('albums.json').toString('utf8')) as unknown[];
    expect(t.n).toBe(albums.length);
    expect(t.positionsHash).toBe(crypto.createHash('sha256').update(read('positions.json')).digest('hex').slice(0, 12));
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

  it.each(STOP_IDS)('has the sharper image of %s: the prototype\'s texels per raw unit over the same rectangle, under 1 MB', async (stop) => {
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
    // And the quality was not turned down without anyone looking. Until the 10k catalog this was a floor of 0.5
    // bits a pixel, which measures the picture as much as the quality: with 10,467 albums the gas is smoother and
    // a little more of the rectangle is sky, and the same quality gives 0.44. So the file is weighed against
    // itself encoded again at 84, the quality that smeared the swirl. At the bake's 95 it is 1.5 to 1.6 times
    // that, on the 4,081-album images and on these alike; a file made at 84 would be 1.0.
    const at84 = await sharp(b).webp({ quality: 84, alphaQuality: 100, effort: 5 }).toBuffer();
    expect(b.length / at84.length).toBeGreaterThan(1.4);
  }, 60_000);

  it('holds the brightest gas under the bake\'s peak in every image, so a star can be brighter than the gas behind it', async () => {
    // scripts/theme/bake-core.js GAS.PEAK is 0.8 of 1 for the largest channel: 204 of 255. The lossy colour of the
    // WebP may overshoot a little at a sharp edge (the bake checks a mean error of 2); 8 levels are allowed, and
    // nearly every pixel is under the peak itself. Before the cap the densest gas was 255.
    const t = theme();
    for (const stop of STOP_IDS) {
      const g = t.gas[stop];
      for (const file of [`gas-${stop}.${g.hash[0]}.webp`, `gas-${stop}-sharp.${g.hash[1]}.webp`]) {
        const { data, info } = await sharp(read(`theme/${file}`)).raw().toBuffer({ resolveWithObject: true });
        let most = 0;
        let over = 0;
        for (let i = 0; i < data.length; i += info.channels) {
          const m = Math.max(data[i], data[i + 1], data[i + 2]);
          if (m > most) most = m;
          if (m > 204) over++;
        }
        expect(most, `${file}: brightest channel`).toBeLessThanOrEqual(204 + 8);
        expect(over / (info.width * info.height), `${file}: share of pixels over the peak`).toBeLessThan(0.001);
        // and the cap did not flatten the picture: the brightest gas is still near the peak
        expect(most, `${file}: brightest channel`).toBeGreaterThan(180);
      }
    }
  }, 60_000);

  it('keeps every album inside its stop\'s gas rectangle, with the padding to spare', () => {
    const t = theme();
    const positions = JSON.parse(read('positions.json').toString('utf8')) as Record<string, number[]>;
    for (const s of STOP_IDS) {
      const [x0, y0, x1, y1] = t.gas[s].rect;
      const p = positions[s];
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0 + 0.06 || p[i] > x1 - 0.06 || p[i + 1] < y0 + 0.06 || p[i + 1] > y1 - 0.06) throw new Error(`${s}: album ${i / 2} at ${p[i]}, ${p[i + 1]} is outside the gas rectangle`);
      }
    }
  });

  it('stays inside the GPU memory budgets (RGBA with mips: 4 bytes a px, times 4/3; MB of a million bytes)', () => {
    const t = theme();
    const mb = ([w, h]: number[]) => (w * h * 4 * (4 / 3)) / 1e6;
    const first = STOP_IDS.reduce((sum, s) => sum + mb(t.gas[s].px), 0);
    const sharpest = Math.max(...STOP_IDS.map((s) => mb(t.gas[s].sharp)));
    // Phones and every other device that keeps to the first images: 58 MB. The committed bake needs 57.98, and
    // three whole 2048 px squares would need 67.1, so a bake whose rectangles grow fails here.
    expect(first).toBeLessThanOrEqual(58);
    expect(first).toBeGreaterThan(40); // the sum is of real images
    // Desktops: the three first images and one sharper image at a time, 124 MB (the committed bake: 123.9)
    expect(first + sharpest).toBeLessThanOrEqual(124);
  });

  it('holds the gas of each stop under that stop\'s albums, in both images (not mirrored, not shifted)', async () => {
    // Every album's raw position is mapped into the image with the map shader's own rule (shaders/gas.ts uvIn:
    // u = (x - west) / width, v = (north - y) / height of theme.json's rectangle), and the gas luma found there is
    // compared with stars.bg, which the bake takes from a separate render of the whole square. With the image in
    // place the two agree; mirrored, upside down or moved by a hundredth of a raw unit (10 px at the overview)
    // they agree less.
    const t = theme();
    const positions = JSON.parse(read('positions.json').toString('utf8')) as Record<string, number[]>;
    const corr = (a: number[], b: number[]): number => {
      const n = a.length;
      const ma = a.reduce((s, v) => s + v, 0) / n;
      const mb2 = b.reduce((s, v) => s + v, 0) / n;
      let sab = 0;
      let saa = 0;
      let sbb = 0;
      for (let i = 0; i < n; i++) {
        sab += (a[i] - ma) * (b[i] - mb2);
        saa += (a[i] - ma) ** 2;
        sbb += (b[i] - mb2) ** 2;
      }
      return sab / Math.sqrt(saa * sbb);
    };
    for (const [k, stop] of STOP_IDS.entries()) {
      const g = t.gas[stop];
      const P = positions[stop];
      const bg = Array.from({ length: t.n }, (_, i) => t.stars.bg[3 * i + k]);
      const [x0, y0, x1, y1] = g.rect;
      for (const [kind, file, size] of [['first', `gas-${stop}.${g.hash[0]}.webp`, g.px], ['sharper', `gas-${stop}-sharp.${g.hash[1]}.webp`, g.sharp]] as const) {
        const { data, info } = await sharp(read(`theme/${file}`)).raw().toBuffer({ resolveWithObject: true });
        expect([info.width, info.height], file).toEqual(size);
        const under = (mirrorX: boolean, mirrorY: boolean, dx: number, dy: number): number[] =>
          Array.from({ length: t.n }, (_, i) => {
            let x = P[2 * i] + dx;
            let y = P[2 * i + 1] + dy;
            if (mirrorX) x = x0 + x1 - x;
            if (mirrorY) y = y0 + y1 - y;
            const u = (x - x0) / (x1 - x0);
            const v = (y1 - y) / (y1 - y0);
            if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
            const o = info.channels * (Math.floor(v * info.height) * info.width + Math.floor(u * info.width));
            return 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
          });
        const inPlace = corr(under(false, false, 0, 0), bg);
        const where = `${stop} ${kind}`;
        expect(inPlace, where).toBeGreaterThan(0.95);
        expect(corr(under(true, false, 0, 0), bg), `${where} mirrored east to west`).toBeLessThan(inPlace - 0.3);
        expect(corr(under(false, true, 0, 0), bg), `${where} mirrored north to south`).toBeLessThan(inPlace - 0.3);
        expect(corr(under(true, true, 0, 0), bg), `${where} turned round`).toBeLessThan(inPlace - 0.3);
        for (const [dx, dy] of [[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]]) expect(corr(under(false, false, dx, dy), bg), `${where} moved by ${dx}, ${dy}`).toBeLessThan(inPlace);
      }
    }
  }, 60_000);

  it('keeps theme.json under 80 KB on disk, since every map visit loads it', () => {
    expect(read('theme/theme.json').length).toBeLessThan(80_000);
  });
});
