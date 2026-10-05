/**
 * Preload for timed runs on a laptop that is on battery at 20% or less. There Chrome's Energy Saver halves the
 * frame rate (every requestAnimationFrame gap reads about 33 ms), which makes every frame-gap measure useless,
 * on today's site as much as on a new build. No command-line switch turns it off; the setting lives in the
 * profile's `Local State`. This file makes `chromium.launch()` start Chrome on a throwaway profile whose Energy
 * Saver is off, and changes nothing else: same channel, same arguments, one context per profile.
 *
 *   node --import ./scripts/perf/no-energy-saver.mjs scripts/perf/perf.mjs
 *
 * `browser.newContext()` starts a browser of its own, so a script that opens several contexts gets a cold
 * browser for each (npm run perf opens one per browser, so it is measured exactly as without this file).
 * Not needed on mains power or above 20% battery. Say so in the write-up when it was used.
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
  let shared = null;
  return {
    version: () => version,
    newContext,
    newPage: async () => {
      shared ??= await newContext();
      return shared.newPage();
    },
    close: async () => {
      for (const ctx of [...open]) await ctx.close();
    },
  };
};
console.error('no-energy-saver: Chrome runs on a throwaway profile with Energy Saver off');
