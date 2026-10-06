/** The favicon sources (the three SVGs that scripts/icons/build.mjs renders) use only the Trifid palette and keep the
 * mark, and the binaries a browser is served (favicon.ico, apple-icon.png) are renders of those sources as they are now. */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';

describe('favicon', () => {
  const ICONS = ['src/app/icon.svg', 'scripts/icons/icon-16.svg', 'scripts/icons/apple-icon.svg'];
  const icon = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

  it('uses only the Trifid palette: no colour of the old warm theme', () => {
    // Sky, raised edge, ash lines, dust stars, the lamp star (globals.css: room, room-4, ash, dust, lamp).
    const ALLOWED = ['#07060a', '#24222c', '#aaa49d', '#c4beb6', '#f1ece4'];
    for (const f of ICONS) {
      const used = [...new Set([...icon(f).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];
      expect(used.filter((c) => !ALLOWED.includes(c)), f).toEqual([]);
      expect(used, f).toContain('#f1ece4');
    }
  });

  it('keeps the mark: three stars joined by lines', () => {
    for (const f of ICONS) {
      expect([...icon(f).matchAll(/<circle /g)].length, f).toBe(3);
      expect([...icon(f).matchAll(/<path /g)].length, f).toBe(1);
    }
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

/** What a render of an icon source must show: each star's centre in its fill, and the middle of the first line
 * (the one joining the two small stars) in the stroke at its opacity over the sky. Points in the source's units. */
function marks(svg) {
  const num = (tag, name) => Number(new RegExp(`\\b${name}="([^"]+)"`).exec(tag)[1]);
  const stars = [...svg.matchAll(/<circle [^>]*>/g)].map(([tag]) => ({ x: num(tag, 'cx'), y: num(tag, 'cy'), rgb: hex(/fill="(#[0-9a-f]{6})"/.exec(tag)[1]) }));
  const path = /<path [^>]*>/.exec(svg)[0];
  const alpha = /stroke-opacity/.test(path) ? num(path, 'stroke-opacity') : 1;
  const stroke = hex(/stroke="(#[0-9a-f]{6})"/.exec(path)[1]);
  // The first line runs from the first small star to the second.
  const line = { x: (stars[0].x + stars[1].x) / 2, y: (stars[0].y + stars[1].y) / 2, rgb: stroke.map((c, i) => c * alpha + SKY[i] * (1 - alpha)) };
  return [...stars, line];
}

/** Every mark of `svg` is in `image` where `place` puts it, within a few levels (antialiasing and rounding). */
function expectRender(image, svg, place, label) {
  for (const m of marks(svg)) {
    const [x, y] = place(m.x, m.y);
    const got = image.at(x, y);
    const off = Math.max(...m.rgb.map((c, i) => Math.abs(c - got[i])));
    expect(off, `${label} at ${m.x},${m.y}: ${got.slice(0, 3)} for ${m.rgb.map(Math.round)}`).toBeLessThanOrEqual(8);
    expect(got[3], `${label} at ${m.x},${m.y} alpha`).toBe(255);
  }
}

describe('favicon binaries', () => {
  const ROOT = process.cwd();
  const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

  it('favicon.ico holds 16, 32 and 48 px PNG entries rendered from the sources as they are now', () => {
    const ico = fs.readFileSync(path.join(ROOT, 'src/app/favicon.ico'));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    const SOURCES = { 16: ['scripts/icons/icon-16.svg', 16], 32: ['src/app/icon.svg', 32], 48: ['src/app/icon.svg', 32] };
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
      const [file, box] = SOURCES[px];
      expectRender(image, source(file), (x, y) => [(x * px) / box, (y * px) / box], `favicon.ico ${px} px from ${file}`);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('apple-icon.png is 180 x 180, opaque, and rendered from its source as it is now', () => {
    const image = png(fs.readFileSync(path.join(ROOT, 'src/app/apple-icon.png')));
    expect([image.width, image.height]).toEqual([180, 180]);
    expect(image.at(0, 0)).toEqual([...SKY, 255]);
    const svg = source('scripts/icons/apple-icon.svg');
    // Its mark is drawn inside translate(tx ty) scale(k) translate(ux uy), on a 32 unit box.
    const [tx, ty, k, ux, uy] = /transform="translate\(([\d.-]+) ([\d.-]+)\) scale\(([\d.]+)\) translate\(([\d.-]+) ([\d.-]+)\)"/.exec(svg).slice(1).map(Number);
    expectRender(image, svg, (x, y) => [((tx + k * (x + ux)) * 180) / 32, ((ty + k * (y + uy)) * 180) / 32], 'apple-icon.png');
  });
});
