#!/usr/bin/env node
/** The last step of `npm run theme`, and `npm run theme:module` by itself: writes src/lib/data/theme.generated.ts
 * from what is already in public/data (theme.json, the first gas image of each stop, positions.json). It bakes
 * nothing again and never touches the gas images, so their names and bytes stay as they are.
 *
 * The module holds what a page needs before theme.json has arrived:
 *   - the hashes in the gas images' names, so the server HTML can ask for the opening image at once;
 *   - where each stop's gas lies and what the map's opening views are fitted to, in world units, so a stand-in
 *     picture can be placed where the map will draw the nebula (src/components/map/overlays/GasPlaceholder.tsx);
 *   - that stand-in: per stop a tiny, soft copy of the nebula as the map shows it at its opening views (the dust
 *     and the glow applied, on the pane's colour), as a WebP data URI of about 1.3 KB. The page shows it
 *     enlarged, blurred and through a round mask.
 * Everything here is worked out from files, with sharp alone: the same input gives the same module. */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import './bake-core.js';

const T = globalThis.RMR_THEME;
const ROOT = path.resolve(import.meta.dirname, '../..');

/** The map's sky and the share of blurred gas it adds back as glow: GAS_SKY and GAS_GLOW in
 * src/components/map/shaders/gas.ts (build-module.test.mjs keeps them equal). */
export const SKY = [0.024, 0.022, 0.034];
export const GLOW = 0.18;
/** A stand-in picture: its longer side in px, how much the source is softened before it is scaled down (a
 * Gaussian's sigma in px of the small picture), and the WebP quality.
 * /map opens on the middle third of the picture enlarged about twenty times. Whatever the picture holds, a
 * browser's plain (bilinear) enlargement of it shows the grid of its texels there, and a lossy encode's blocks
 * with it; so the page blurs the picture again where it shows it (PLACEHOLDER_DISPLAY_BLUR, applied by
 * overlays/GasPlaceholder.tsx as an SVG Gaussian blur), which leaves neither. The picture therefore needs no more
 * detail than that blur lets through: 96 px. Quality 96 keeps the codec's blocks under what the blur removes. */
export const PLACEHOLDER_PX = 96;
export const PLACEHOLDER_SOFTEN = 1.2;
export const PLACEHOLDER_QUALITY = 96;
/** The blur the page applies when it shows the picture, as a Gaussian's sigma in texels of the picture. */
export const PLACEHOLDER_DISPLAY_BLUR = 1;
/** The page shows the picture through a round mask (overlays/GasPlaceholder.tsx): fully shown inside an ellipse
 * this share of the way from its middle to its edges, fading to nothing at the ellipse that touches its four
 * edges, so nothing of it ends in a straight line: the real nebula fades into the sky, and so does this. The gas
 * itself ends well inside (the image's rectangle is padded with sky), so the mask takes next to none of its light
 * (checked below, with `feather`, the same curve). The mask is the page's and not an alpha channel in the picture:
 * that cost 700 bytes a picture. */
export const PLACEHOLDER_FEATHER_FROM = 0.78;
/** The pane's own colour, --color-pane #07060a (app/globals.css). The sky the map draws is a level darker in red
 * and blue; the picture's dark parts are lifted by that level, so where there is no gas it is the pane's colour
 * and its fading edge has nothing to show. */
export const PANE = [7, 6, 10];
/** A stand-in is refused when it is not this small (bytes of the WebP, before base64). */
export const PLACEHOLDER_MAX_BYTES = 3072;

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
const round5 = (v) => Math.round(v * 1e5) / 1e5;

/**
 * What the map's two opening views are fitted to, for one stop's layout (flat raw [x0, y0, ...]) under the app's
 * transform `tx`: the cloud's full extent [minX, minY, maxX, maxY] (state/bounds.ts getCloudBounds, the Whole map
 * of Home, About and 404) and [x1, x99, medY], the 1st and 99th percentile of x and the median of y
 * (overviewExtent, the Overview /map opens at). World units, read from 32-bit floats as the app holds them.
 */
export function stopFraming(raw, tx) {
  const n = raw.length / 2;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = (raw[2 * i] - tx.cx) * tx.s;
    ys[i] = (raw[2 * i + 1] - tx.cy) * tx.s;
  }
  xs.sort();
  ys.sort();
  return {
    cloud: [xs[0], ys[0], xs[n - 1], ys[n - 1]].map(round5),
    span: [quantile(xs, 0.01), quantile(xs, 0.99), quantile(ys, 0.5)].map(round5),
  };
}

/** A raw rectangle [west, south, east, north] in world units. */
export function worldRect(rect, tx) {
  return [(rect[0] - tx.cx) * tx.s, (rect[1] - tx.cy) * tx.s, (rect[2] - tx.cx) * tx.s, (rect[3] - tx.cy) * tx.s].map(round5);
}

/**
 * The colour the map shows for one texel of a gas image at its opening views, as sRGB bytes: the sky plus the
 * gas's light under its dust, with the glow's share (the map's lighter shader, strength 1 and all of the dust:
 * shaders/gas.ts GAS_FRAGMENT_SHADER_LITE). `r`, `g`, `b` are the toned gas and `a` what the dust lets through,
 * all 0 to 255 and not multiplied together.
 */
export function shownColour(r, g, b, a) {
  const k = a / 255;
  const one = (v, sky) => {
    const light = (1 - Math.pow(Math.max(1 - v / 255, 0.002), k)) * (1 + GLOW);
    return Math.min(255, Math.max(0, Math.round((sky + light) * 255)));
  };
  return [one(r, SKY[0]), one(g, SKY[1]), one(b, SKY[2])];
}

const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** How much of the picture shows at texel (x, y) of a w x h picture: 1 inside the inner ellipse, 0 from the
 * ellipse that touches the picture's edges outwards (so at every edge texel and in the corners). */
export function feather(x, y, w, h) {
  if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 0;
  const r = Math.hypot((x + 0.5 - w / 2) / (w / 2 - 1), (y + 0.5 - h / 2) / (h / 2 - 1));
  return 1 - smooth((r - PLACEHOLDER_FEATHER_FROM) / (1 - PLACEHOLDER_FEATHER_FROM));
}

/** The stand-in picture of a gas image (the bytes of a first image, a WebP with a dust channel): a WebP of at most
 * PLACEHOLDER_PX a side, softened (blurred at full size, then scaled down), on the pane's colour, with its mean colour where there is
 * gas and the share of its light the page's round mask takes. */
export async function placeholder(webp) {
  const { data, info } = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`a gas image with ${info.channels} channels (4 expected)`);
  const { width: w, height: h } = info;
  const rgb = Buffer.alloc(3 * w * h);
  for (let i = 0; i < w * h; i++) {
    const c = shownColour(data[4 * i], data[4 * i + 1], data[4 * i + 2], data[4 * i + 3]);
    rgb[3 * i] = c[0];
    rgb[3 * i + 1] = c[1];
    rgb[3 * i + 2] = c[2];
  }
  const scale = PLACEHOLDER_PX / Math.max(w, h);
  const size = [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
  const raw = { raw: { width: w, height: h, channels: 3 } };
  // Two steps: sharp scales before it blurs when both are asked of one pipeline.
  const soft = await sharp(rgb, raw).blur(PLACEHOLDER_SOFTEN / scale).raw().toBuffer();
  const small = await sharp(soft, raw).resize(size[0], size[1], { kernel: 'cubic', fit: 'fill' }).raw().toBuffer();
  const sky = SKY.map((v) => Math.round(v * 255));
  const out = Buffer.alloc(3 * size[0] * size[1]);
  const tone = [0, 0, 0];
  let lit = 0;
  let light = 0;
  let lost = 0;
  for (let y = 0; y < size[1]; y++) {
    for (let x = 0; x < size[0]; x++) {
      const i = y * size[0] + x;
      const a = feather(x, y, size[0], size[1]);
      const over = Math.max(0, small[3 * i] - sky[0]) + Math.max(0, small[3 * i + 1] - sky[1]) + Math.max(0, small[3 * i + 2] - sky[2]);
      light += over;
      lost += over * (1 - a);
      if (over > 60) {
        lit++;
        for (let c = 0; c < 3; c++) tone[c] += small[3 * i + c];
      }
      // (never under the pane's colour: the sky becomes the pane)
      for (let c = 0; c < 3; c++) out[3 * i + c] = Math.max(small[3 * i + c], PANE[c]);
    }
  }
  const bytes = await sharp(out, { raw: { width: size[0], height: size[1], channels: 3 } }).webp({ quality: PLACEHOLDER_QUALITY, effort: 6, smartSubsample: true }).toBuffer();
  if (bytes.length > PLACEHOLDER_MAX_BYTES) throw new Error(`a stand-in picture of ${bytes.length} bytes (at most ${PLACEHOLDER_MAX_BYTES}): lower PLACEHOLDER_PX or PLACEHOLDER_QUALITY`);
  // The mask must not dim the nebula: it may take a hundredth of the picture's light at most.
  if (lost > light * 0.01) throw new Error(`the round mask takes ${((100 * lost) / light).toFixed(1)}% of a stand-in picture's light: the gas reaches its edge`);
  // As a browser will decode it: where there is no gas (its edges) it must be the pane's colour to within what the
  // display blur evens out, and never under it.
  const back = await sharp(bytes).removeAlpha().raw().toBuffer();
  let edge = 0;
  for (let y = 0; y < size[1]; y++) {
    for (let x = 0; x < size[0]; x += y === 0 || y === size[1] - 1 ? 1 : size[0] - 1) {
      const o = 3 * (y * size[0] + x);
      edge = Math.max(edge, Math.abs(back[o] - PANE[0]), Math.abs(back[o + 1] - PANE[1]), Math.abs(back[o + 2] - PANE[2]));
    }
  }
  if (edge > 6) throw new Error(`the edge of a stand-in picture is ${edge} levels off the pane's colour`);
  return { bytes, size, tone: tone.map((v) => Math.round(v / Math.max(lit, 1))), lost: lost / light };
}

/** The text of theme.generated.ts for the theme in `dataDir`. */
export async function themeModule(dataDir) {
  const theme = JSON.parse(fs.readFileSync(path.join(dataDir, 'theme/theme.json'), 'utf8'));
  const positions = JSON.parse(fs.readFileSync(path.join(dataDir, 'positions.json'), 'utf8'));
  const tx = T.positionsTransform(positions.balanced);
  const stops = {};
  const pictures = {};
  for (const stop of T.STOPS) {
    const gas = theme.gas[stop];
    const made = await placeholder(fs.readFileSync(path.join(dataDir, 'theme', T.gasFile(`gas-${stop}`, gas.hash[0]))));
    stops[stop] = { hash: gas.hash, gas: worldRect(gas.rect, tx), ...stopFraming(positions[stop], tx), tone: made.tone };
    pictures[stop] = made;
  }
  const lines = [
    '// Written by `npm run theme` (scripts/theme/build-module.mjs) from public/data/theme and public/data/positions.json.',
    '// Do not edit: run `npm run theme:module` instead. src/lib/data/theme.generated.test.ts fails when it is stale.',
    '',
    '/** What is known of the baked theme before theme.json arrives. Per stop: `hash`, the hashes in the names of its',
    ' * two gas images (theme.json gas.<stop>.hash); and in world units (components/map/data.ts), y up: `gas`, the',
    ' * rectangle its images cover [west, south, east, north]; `cloud`, the full extent of its albums [minX, minY,',
    ' * maxX, maxY] (the Whole map is fitted to it); `span`, [x1, x99, medY]: the 1st and 99th percentile of x and the',
    ' * median of y (the Overview is fitted to them). `tone`: the mean colour of its nebula, sRGB bytes.',
    ' * `picturePx` is the longer side of every stand-in picture below; they are shown with a blur of `pictureBlur`',
    ' * texels and through a round mask that fades out from `pictureFadeFrom` of the way to their edges',
    ' * (overlays/GasPlaceholder.tsx). */',
    'export const THEME_BAKE = {',
    `  picturePx: ${PLACEHOLDER_PX},`,
    `  pictureBlur: ${PLACEHOLDER_DISPLAY_BLUR},`,
    `  pictureFadeFrom: ${PLACEHOLDER_FEATHER_FROM},`,
    `  n: ${theme.n},`,
    `  positionsHash: '${theme.positionsHash}',`,
    '  stops: {',
    ...T.STOPS.map((s) => `    ${s}: { hash: ${JSON.stringify(stops[s].hash).replace(/"/g, "'").replace(',', ', ')}, gas: [${stops[s].gas.join(', ')}], cloud: [${stops[s].cloud.join(', ')}], span: [${stops[s].span.join(', ')}], tone: [${stops[s].tone.join(', ')}] },`),
    '  },',
    '} as const;',
    '',
    `/* A stand-in for each stop's nebula: a soft copy at most ${PLACEHOLDER_PX} px a side, as the map shows the gas at its opening`,
    ' * views (dust and glow applied, on the pane\'s colour). Shown enlarged, blurred and through a round mask.',
    ' * Separate exports, so a page ships only the one it shows. */',
    ...T.STOPS.flatMap((s) => [
      `/** ${pictures[s].size.join(' x ')} px, ${pictures[s].bytes.length} bytes. */`,
      `export const GAS_PLACEHOLDER_${s.toUpperCase()} = 'data:image/webp;base64,${pictures[s].bytes.toString('base64')}';`,
    ]),
    '',
  ];
  return { text: lines.join('\n'), pictures };
}

/** Writes the module for the committed data and returns what it holds. */
export async function writeThemeModule(dataDir = path.join(ROOT, 'public/data'), outFile = path.join(ROOT, 'src/lib/data/theme.generated.ts')) {
  const made = await themeModule(dataDir);
  const tmp = `${outFile}.tmp`;
  fs.writeFileSync(tmp, made.text);
  fs.renameSync(tmp, outFile);
  return made;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeThemeModule()
    .then(({ pictures }) => {
      for (const [stop, p] of Object.entries(pictures)) console.log(`stand-in for ${stop}: ${p.size.join(' x ')} px, ${p.bytes.length} bytes`);
      console.log('src/lib/data/theme.generated.ts written');
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
