/**
 * Preload for timed runs on a laptop that is on battery at 20% or less. There Chrome's Energy Saver halves the
 * frame rate (every requestAnimationFrame gap reads about 33 ms), which makes every frame-gap measure useless,
 * on today's site as much as on a new build. No command-line switch turns it off; the setting lives in the
 * profile's `Local State`. This file makes `chromium.launch()` start Chrome on a throwaway profile whose Energy
 * Saver is off, and changes nothing else: same channel, same arguments, one context per profile.
 *
 *   node --import ./scripts/perf/no-energy-saver.mjs scripts/perf/perf.mjs
 *
 * This is NOT the same as an ordinary launch, so do not compare its numbers with ordinary ones without saying so:
 * - every `browser.newContext()` starts a Chrome of its own on a fresh profile (a persistent context), so a
 *   script that opens several contexts gets a cold browser for each;
 * - `chromium.launch()` first makes one ordinary launch, only to read the version string, and closes it;
 * - `browser.newPage()` (the native-architecture check of scripts/check-native.mjs uses it) starts one more
 *   Chrome, which is closed again when that page closes.
 * Measured on this laptop: the gpu rows land where an ordinary launch puts them; a software renderer starts
 * more slowly on the fresh profile (search usable and map first frame were 30 to 100% later). Use it only when
 * the battery leaves no choice, never for the numbers a write-up leads with, and say when it was used.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');
const launch = chromium.launch.bind(chromium);

chromium.launch = async (options = {}) => {
  // The version string and the native-architecture check come from an ordinary launch, closed at once.
  const plain = await launch(options);
  const version = plain.version();
  await plain.close();
  const open = [];
  const newContext = async (contextOptions = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmr-no-energy-saver-'));
    fs.writeFileSync(path.join(dir, 'Local State'), JSON.stringify({ performance_tuning: { battery_saver_mode: { state: 0 } } }));
    const ctx = await chromium.launchPersistentContext(dir, { ...options, ...contextOptions });
    const close = ctx.close.bind(ctx);
    ctx.close = async () => {
      await close();
      fs.rmSync(dir, { recursive: true, force: true });
      open.splice(open.indexOf(ctx), 1);
    };
    open.push(ctx);
    return ctx;
  };
  return {
    version: () => version,
    newContext,
    newPage: async () => {
      const ctx = await newContext();
      const page = await ctx.newPage();
      page.on('close', () => void ctx.close().catch(() => {}));
      return page;
    },
    close: async () => {
      for (const ctx of [...open]) await ctx.close();
    },
  };
};
console.error('no-energy-saver: Chrome runs on a throwaway profile with Energy Saver off');
