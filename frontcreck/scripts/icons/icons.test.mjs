/** The favicon sources (the three SVGs that scripts/icons/build.mjs renders) use only the Eddy mark's colours and are
 * the Eddy mark, each in its own slot: three gas arms (teal, gold, salmon) curling into a cream core. The binaries a
 * browser is served (favicon.ico, apple-icon.png) have the right sizes and were built from those sources as they are
 * now: build.mjs records each source's SHA-256 in built.json, and a few coarse colour probes look at the renders. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const ICONS = ['src/app/icon.svg', 'scripts/icons/icon-16.svg', 'scripts/icons/apple-icon.svg'];
const icon = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const count = (text, re) => [...text.matchAll(re)].length;

describe('favicon', () => {
  it('uses only the colours of the Eddy mark', () => {
    // The list in docs/design/trifid-theme-favicon/designs/a-trifid/eddy-final/NOTES.md, by family.
    const ALLOWED = [
      // The tile: sky and its raised edge (globals.css: room, room-4).
      '#07060a', '#24222c',
      // Teal arm, deep to pale.
      '#3f8f9d', '#4f8fa6', '#74c3c6', '#d9f3ee', '#e6f8f3',
      // Gold arm, deep to pale.
      '#a9814a', '#c29c62', '#e2bd80', '#e9c98f', '#fdf3d8', '#fff8e4',
      // Salmon arm, deep to pale.
      '#a85a56', '#c46d55', '#e08a6a', '#fbd3bb', '#fde0cc',
      // The cream core's glow, and star white for the core point and the stars.
      '#e2b48e', '#efd9ae', '#fff6dc', '#fffaf4',
    ];
    const all = new Set();
    for (const f of ICONS) {
      const used = [...new Set([...icon(f).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];
      expect(used.filter((c) => !ALLOWED.includes(c)), f).toEqual([]);
      // No colour written another way (a three digit hex, rgb(), hsl()).
      expect(count(icon(f), /#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\(|hsla?\(/g), f).toBe(0);
      used.forEach((c) => all.add(c));
    }
    // And the list holds nothing the sources do not use.
    expect([...all].sort()).toEqual([...ALLOWED].sort());
  });

  it('is the Eddy mark, each file in its own slot', () => {
    const TILE = { 'src/app/icon.svg': [32, 31, '7'], 'scripts/icons/icon-16.svg': [16, 15, '3.5'] };
    for (const f of ICONS) {
      const svg = icon(f);
      // Three arms, one per gradient, round a core gradient.
      for (const id of ['t', 'g', 'r']) expect(count(svg, new RegExp(`<path fill="url\\(#${id}\\)"`, 'g')), `${f} arm ${id}`).toBe(1);
      expect(count(svg, /<radialGradient /g), f).toBe(4);
      expect(svg, f).toContain('fill="url(#k)"');
      // Not the mark this replaced: three plain grey stars joined by one stroked line path.
      expect(svg, f).not.toMatch(/<path d="M7 10|stroke="#aaa49d"|fill="#c4beb6"/);
      if (TILE[f]) {
        const [box, side, rx] = TILE[f];
        expect(svg, f).toContain(`viewBox="0 0 ${box} ${box}"`);
        // The dark rounded tile with its edge.
        expect(svg, f).toContain(`<rect x=".5" y=".5" width="${side}" height="${side}" rx="${rx}" fill="#07060a" stroke="#24222c"/>`);
      }
    }
    // 16 px: drawn for the pixel grid, no filters. 32 px: blurs only. 180 px: full-bleed opaque sky (the phone rounds
    // the corners itself), torn gas edges and a few stars.
    expect(icon('scripts/icons/icon-16.svg')).not.toContain('<filter');
    expect(count(icon('src/app/icon.svg'), /<filter /g)).toBe(3);
    expect(icon('src/app/icon.svg')).not.toMatch(/feTurbulence|feDisplacementMap/);
    const apple = icon('scripts/icons/apple-icon.svg');
    expect(apple).toContain('viewBox="0 0 180 180"');
    expect(apple).toContain('<rect width="180" height="180" fill="#07060a"/>');
    expect(apple).not.toMatch(/\brx="|#24222c/);
    expect(apple).toMatch(/<feTurbulence [^>]*\/><feDisplacementMap /);
  });
});

/** A PNG's size, colour type and a pixel reader (8-bit RGB or RGBA, not interlaced: what Chromium's screenshots are). */
function png(buf) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const idat = [];
  let head = null;
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') head = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colour: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  expect([head.depth, head.interlace]).toEqual([8, 0]);
  expect([2, 6]).toContain(head.colour);
  const bpp = head.colour === 6 ? 4 : 3;
  const stride = head.width * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * head.height);
  for (let y = 0; y < head.height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      const paeth = () => {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      const pred = [0, a, b, (a + b) >> 1, paeth()][filter];
      px[y * stride + i] = (raw[y * (stride + 1) + 1 + i] + pred) & 255;
    }
  }
  /** [r, g, b, a] of the pixel that holds the point (x, y). */
  const at = (x, y) => {
    const o = Math.floor(y) * stride + Math.floor(x) * bpp;
    return [px[o], px[o + 1], px[o + 2], bpp === 4 ? px[o + 3] : 255];
  };
  return { ...head, at };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const SKY = hex('#07060a');

/** Coarse probes of a render, at points in the source's units: the gas is blurred, so they ask only which way a
 * colour leans, by a wide margin (the real gaps are 60 levels and more), never for an exact value. */
function expectEddy(image, scale, { teal, salmon, core }, label) {
  const at = ([x, y]) => image.at(x * scale, y * scale);
  const [tr, tg, tb, ta] = at(teal);
  expect(Math.min(tg, tb) - tr, `${label} teal arm ${[tr, tg, tb]}: more blue-green than red`).toBeGreaterThan(25);
  const [sr, sg, sb, sa] = at(salmon);
  expect(sr - Math.max(sg, sb), `${label} salmon arm ${[sr, sg, sb]}: more red than green or blue`).toBeGreaterThan(25);
  const [cr, cg, cb, ca] = at(core);
  expect(Math.min(cr, cg, cb), `${label} core ${[cr, cg, cb]}: near white`).toBeGreaterThan(200);
  expect([ta, sa, ca], `${label} alpha`).toEqual([255, 255, 255]);
}

describe('favicon binaries', () => {
  it('were built from the sources as they are now (run node scripts/icons/build.mjs after changing one)', () => {
    const built = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/icons/built.json'), 'utf8'));
    const now = Object.fromEntries(ICONS.map((f) => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex')]));
    expect(built).toEqual(now);
  });

  it('favicon.ico holds 16, 32 and 48 px RGBA PNG entries of the mark with a clear corner', () => {
    const ico = fs.readFileSync(path.join(ROOT, 'src/app/favicon.ico'));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    // Probe points on each entry's source box: 16 units for icon-16.svg, 32 for icon.svg (the 32 and 48 px entries).
    const PROBES = {
      16: [16, { teal: [3.5, 8.5], salmon: [12.5, 9.5], core: [8.5, 8.5] }],
      32: [32, { teal: [6.5, 16.5], salmon: [22.5, 20.5], core: [15.8, 17.6] }],
      48: [32, { teal: [6.5, 16.5], salmon: [22.5, 20.5], core: [15.8, 17.6] }],
    };
    const sizes = [];
    for (let i = 0; i < 3; i++) {
      const e = 6 + 16 * i;
      const px = ico.readUInt8(e);
      sizes.push(px);
      expect(ico.readUInt8(e + 1)).toBe(px);
      const image = png(ico.subarray(ico.readUInt32LE(e + 12), ico.readUInt32LE(e + 12) + ico.readUInt32LE(e + 8)));
      expect([image.width, image.height, image.colour], `entry ${px}`).toEqual([px, px, 6]);
      // The tile's rounded corner is clear.
      expect(image.at(0, 0)[3], `entry ${px} corner`).toBe(0);
      const [box, probes] = PROBES[px];
      expectEddy(image, px / box, probes, `favicon.ico ${px} px`);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('apple-icon.png is 180 x 180 and opaque, the mark on the sky', () => {
    const image = png(fs.readFileSync(path.join(ROOT, 'src/app/apple-icon.png')));
    expect([image.width, image.height]).toEqual([180, 180]);
    for (const [x, y] of [[0, 0], [179, 0], [0, 179], [179, 179]]) expect(image.at(x, y), `corner ${x},${y}`).toEqual([...SKY, 255]);
    expectEddy(image, 1, { teal: [41.5, 97.5], salmon: [122.5, 115.5], core: [89.1, 98.4] }, 'apple-icon.png');
  });
});
