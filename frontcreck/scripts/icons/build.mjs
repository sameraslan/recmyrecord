#!/usr/bin/env node
/** Renders the icon SVGs to src/app/favicon.ico (16, 32 and 48 px PNG entries) and src/app/apple-icon.png (180 px).
 * One headless Chromium, one page. Run: node scripts/icons/build.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(import.meta.dirname, '../..');
const svg = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

async function render(page, markup, px, opaque) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<style>html,body{margin:0;background:${opaque ? '#07060a' : 'transparent'}}svg{display:block;width:${px}px;height:${px}px}</style>${markup}`);
  return page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: px, height: px } });
}

/** An .ico whose entries are PNG files, the format of the icon this replaces. */
function ico(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach(({ px, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(px, e);
    head.writeUInt8(px, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...entries.map((x) => x.data)]);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const entries = [
    { px: 16, data: await render(page, svg('scripts/icons/icon-16.svg'), 16, false) },
    { px: 32, data: await render(page, svg('src/app/icon.svg'), 32, false) },
    { px: 48, data: await render(page, svg('src/app/icon.svg'), 48, false) },
  ];
  fs.writeFileSync(path.join(ROOT, 'src/app/favicon.ico'), ico(entries));
  fs.writeFileSync(path.join(ROOT, 'src/app/apple-icon.png'), await render(page, svg('scripts/icons/apple-icon.svg'), 180, true));
  console.log('wrote src/app/favicon.ico and src/app/apple-icon.png');
} finally {
  await browser.close();
}
