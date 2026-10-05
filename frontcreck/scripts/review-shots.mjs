#!/usr/bin/env node
/** npm run shots: screenshots of every reviewed state, named like design/mockups/final/shots/. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { assertNativeChrome } from './check-native.mjs';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'test-results/review');
const PORT = 3300;
let BASE = `http://127.0.0.1:${PORT}`;
const IR = '/album/in-rainbows-radiohead';
const SIZES = {
  d1440: { viewport: { width: 1440, height: 900 } },
  d1280: { viewport: { width: 1280, height: 800 } },
  m390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const mapReady = (p) => p.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0 && (window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off'), null, { timeout: 20000 });

const STATES = {
  'a1-home': async (p) => p.goto(`${BASE}/`),
  'a2-home-search': async (p) => {
    await p.goto(`${BASE}/`);
    await p.locator('.hero input').click();
    await p.locator('.hero input').pressSequentially('radiohead');
    await p.getByRole('option').first().waitFor();
    await p.keyboard.press('ArrowDown');
  },
  'a3-search-none': async (p) => {
    await p.goto(`${BASE}/`);
    await p.locator('.hero input').click();
    await p.locator('.hero input').pressSequentially('zzkq');
    await p.locator('.combo-empty').waitFor();
  },
  'c1-explore': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
  },
  'c2-explore-card': async (p) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.evaluate(() => {
      window.__rmr.getState().setSelected(42);
      window.__rmr.map.flyTo(42);
    });
  },
  'c3-explore-zoomed': async (p, size) => {
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.evaluate(() => window.__rmr.map.flyTo(11));
    await p.waitForTimeout(600);
    await p.evaluate(() => window.__rmr.map.zoomBy(1.6));
    if (size === 'm390') return;
    // The mockup shot hovers In Rainbows: point at it once the zoom has settled, so the hover label is reviewed too.
    await p.waitForFunction(() => !window.__rmr.map.isAnimating(), null, { timeout: 15000 });
    const pt = await p.evaluate(() => window.__rmr.map.screenPoint(11));
    if (pt) await p.mouse.move(pt.x, pt.y);
  },
  'd1-album': async (p) => p.goto(`${BASE}${IR}`),
  'd2-album-sonic': async (p) => p.goto(`${BASE}${IR}?by=sonic`),
  'd3-album-mood': async (p) => p.goto(`${BASE}${IR}?by=mood`),
  'd4-album-deeper': async (p) => {
    await p.goto(`${BASE}${IR}`);
    await p.locator('li.rec').first().locator('a.rec-main').click();
    await p.waitForURL(/\/album\/(?!in-rainbows)/);
  },
  'd5-album-longtitle': async (p) => p.goto(`${BASE}/album/the-rise-and-fall-of-ziggy-stardust-and-the-spiders-from-mars-david-bowie`),
  'e2-error': async (p) => {
    await p.route('**/data/albums.json', (r) => r.abort());
    await p.goto(`${BASE}/map`);
    // Not getByRole('alert'): Next's route announcer is an alert too, which would make the locator ambiguous.
    await p.locator('.map-msg[role="alert"]').waitFor();
  },
  'f1-about': async (p) => p.goto(`${BASE}/about`),
  'g1-transition-mid': async (p, size) => {
    if (size === 'm390') return false;
    await p.goto(`${BASE}/map`);
    await mapReady(p);
    await p.locator('.top-search input').click();
    await p.locator('.top-search input').pressSequentially('in rainbows');
    await p.getByRole('option').first().waitFor();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(180);
    return 'now';
  },
  'h1-album-mapmode': async (p, size) => {
    if (size !== 'm390') return false;
    await p.goto(`${BASE}${IR}`);
    await mapReady(p);
    await p.locator('.fab-map').tap();
  },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer(PORT);
  BASE = server.base;
  const failed = [];
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    await assertNativeChrome(browser);
    const only = process.argv[2] ?? '';
    for (const [size, opts] of Object.entries(SIZES)) {
      for (const [name, run] of Object.entries(STATES)) {
        if (only && !`${size}-${name}`.includes(only)) continue;
        const ctx = await browser.newContext(opts);
        const page = await ctx.newPage();
        try {
          const result = await run(page, size);
          if (result !== false) {
            if (result !== 'now') {
              await page.evaluate(() => document.fonts.ready);
              await page.waitForFunction(() => !window.__rmr?.map || !window.__rmr.map.isAnimating(), null, { timeout: 15000 }).catch((e) => {
                console.warn(`${size}-${name}: the map was still animating after 15 s; shooting anyway (${e.message})`);
              });
              await page.waitForTimeout(900);
            }
            const file = path.join(OUT, `${size}-${name}.png`);
            await page.screenshot({ path: file });
            console.log('wrote', path.relative(ROOT, file));
          }
        } catch (e) {
          // One broken state must not cost every later screenshot; the run still fails at the end.
          failed.push(`${size}-${name}: ${e.message}`);
          console.error(`${size}-${name} failed: ${e.message}`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  if (failed.length) throw new Error(`${failed.length} state(s) failed:\n${failed.join('\n')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
