import { expect, test, type Page } from '@playwright/test';
import { THEME_BAKE } from '../src/lib/data/theme.generated';
import { albumSpread, isPhone, waitForCameraIdle, waitForMap } from './helpers';

/** Issue 78: the map's first picture. The server HTML asks for everything the map needs at once and carries a soft
 * stand-in nebula, placed where the map will draw the real one; the canvas shows once it has the nebula. */

const B = THEME_BAKE.stops.balanced;
const GAS = `/data/theme/gas-balanced.${B.hash[0]}.webp`;
const EARLY = ['/data/albums.json', '/data/positions.json', '/data/theme/theme.json', GAS, '/data/vocab.json'];
/** Every file the map's first picture is drawn from. */
const isMapFile = (pathname: string): boolean => /^\/data\/(albums|positions|vocab)\.json$|^\/data\/theme\//.test(pathname);

/** A route that holds matching requests until `release` is called. */
async function hold(page: Page, glob: string): Promise<() => void> {
  let release = (): void => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(glob, async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

/** The stand-in picture's box on screen, and where it puts the world: a world point (x, y) is drawn at
 * (left + (x - west) / (east - west) * width, top + (north - y) / (north - south) * height). */
async function standIn(page: Page): Promise<{ at: (x: number, y: number) => { x: number; y: number }; box: { x: number; y: number; width: number; height: number } }> {
  const box = await page.locator('.gas-ph image').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const [west, south, east, north] = B.gas;
  return { box, at: (x, y) => ({ x: box.x + ((x - west) / (east - west)) * box.width, y: box.y + ((north - y) / (north - south)) * box.height }) };
}

test('the server HTML asks for the map\'s files at once and carries the stand-in nebula', async ({ request }) => {
  for (const [route, kind] of [['/', 'fit'], ['/map', 'over'], ['/about', 'fit'], ['/album/in-rainbows-radiohead', 'glow']] as const) {
    const html = await (await request.get(route)).text();
    for (const href of EARLY) {
      const link = new RegExp(`<link[^>]*href="${href.replace(/[.]/g, '\\.')}"[^>]*>`).exec(html)?.[0];
      expect(link, `${route}: a preload link for ${href}`).toBeTruthy();
      expect(link, `${route} ${href}`).toContain('rel="preload"');
      // The request fetch() makes later: CORS mode, same-origin credentials. Low priority, behind the page itself.
      expect(link, `${route} ${href}`).toContain('as="fetch"');
      expect(link, `${route} ${href}`).toMatch(/crossorigin(="(anonymous)?")?/i);
      expect(link, `${route} ${href}`).toMatch(/fetchpriority="low"/i);
    }
    // No other nebula image is asked for early, and the map's code is still no script of the page.
    expect(html.match(/gas-(sonic|mood)\.|gas-[a-z]+-sharp\./g) ?? [], route).toEqual([]);
    const ph = /<div class="gas-ph gas-ph--(\w+)"[^>]*>/.exec(html);
    expect(ph?.[1], `${route}: the stand-in`).toBe(kind);
    // Before the canvas host, so the canvas lies over it.
    expect(html.indexOf('class="gas-ph'), route).toBeLessThan(html.indexOf('class="map-host"'));
    const pane = html.slice(html.indexOf('class="gas-ph'), html.indexOf('class="map-host"'));
    if (kind === 'glow') expect(pane, route).not.toContain('<image');
    else expect(pane, route).toMatch(/<image href="data:image\/webp;base64,[A-Za-z0-9+/=]{1300,4200}"/);
  }
});

test('the nebula images are kept for good; theme.json and the data files keep the day', async ({ request }) => {
  const gas = await request.get(GAS);
  expect(gas.ok()).toBe(true);
  expect(gas.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  const sharp = await request.get(`/data/theme/gas-balanced-sharp.${B.hash[1]}.webp`);
  expect(sharp.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  for (const p of ['/data/theme/theme.json', '/data/albums.json', '/data/positions.json']) {
    expect((await request.get(p)).headers()['cache-control'], p).toBe('public, max-age=86400, stale-while-revalidate=604800');
  }
  // still not for other sites
  expect(gas.headers()['cross-origin-resource-policy']).toBe('same-origin');
});

for (const route of ['/', '/map']) {
  test(`${route}: every file is downloaded once, nothing waits for the WebGL probe, and no preload goes unused`, async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      const p = new URL(r.url()).pathname;
      if (isMapFile(p)) requested.push(p);
    });
    const complaints: string[] = [];
    page.on('console', (m) => {
      // Chrome says so when a preloaded file was not used, or was asked for again in another way.
      if (/preload/i.test(m.text())) complaints.push(m.text());
      if (m.type() === 'error') complaints.push(m.text());
    });
    page.on('pageerror', (e) => complaints.push(e.message));
    await page.goto(route, { waitUntil: 'load' });
    await waitForMap(page);
    // Chrome reports an unused preload a few seconds after the page has loaded.
    await page.waitForTimeout(4500);
    for (const p of EARLY) expect(requested.filter((r) => r === p), p).toHaveLength(1);
    // Home loads one nebula image; the map all three, the other two after the first is on screen. No sharper one
    // on this software renderer.
    const others = requested.filter((r) => !EARLY.includes(r));
    expect(others.sort()).toEqual(route === '/' ? [] : [`/data/theme/gas-mood.${THEME_BAKE.stops.mood.hash[0]}.webp`, `/data/theme/gas-sonic.${THEME_BAKE.stops.sonic.hash[0]}.webp`]);
    expect(complaints).toEqual([]);
    const t = await page.evaluate(() => {
      const mark = (name: string) => performance.getEntriesByName(name)[0]?.startTime ?? null;
      const res = (suffix: string) => performance.getEntriesByType('resource').find((r) => new URL(r.name).pathname === suffix) as PerformanceResourceTiming | undefined;
      return {
        warm: mark('rmr-webgl-warm'),
        chunkStart: mark('rmr-chunk-start'),
        dataStart: mark('rmr-data-start'),
        gasFetch: mark('rmr-gas-fetch'),
        gasDecoded: mark('rmr-gas-decoded'),
        mapFrame: mark('rmr-map-frame'),
        gasDrawn: mark('rmr-gas-drawn'),
        shown: mark('rmr-map-shown'),
        albums: res('/data/albums.json')?.startTime ?? null,
        albumsBy: res('/data/albums.json')?.initiatorType ?? null,
        gas: (document.querySelector('link[rel="preload"][href*="gas-balanced"]') && res(document.querySelector('link[rel="preload"][href*="gas-balanced"]')!.getAttribute('href')!)?.startTime) ?? null,
      };
    });
    for (const [name, v] of Object.entries(t)) expect(v, name).not.toBeNull();
    // The preload links started the downloads, before any script of the page asked.
    expect(t.albumsBy).toBe('link');
    expect(t.albums!).toBeLessThan(t.dataStart!);
    // Nothing waits for the WebGL warm-up and probe any more: the data, the nebula image and the map's code were
    // all asked for before it ended.
    for (const k of ['albums', 'gas', 'dataStart', 'gasFetch', 'chunkStart'] as const) expect(t[k]!, k).toBeLessThan(t.warm!);
    // The nebula image was decoded before the canvas drew anything, and the canvas was not shown before its first frame.
    expect(t.gasDecoded!).toBeLessThan(t.mapFrame!);
    expect(t.shown!).toBeGreaterThanOrEqual(t.mapFrame!);
    // Settled: the stand-in is out of the document, and the canvas is fully shown.
    await expect(page.locator('.gas-ph')).toHaveCount(0);
    expect(await page.locator('canvas.map-canvas').evaluate((c) => [c.classList.contains('is-veiled'), getComputedStyle(c).opacity])).toEqual([false, '1']);
  });

  test(`${route}: the stand-in lies where the map then draws the nebula`, async ({ page }, info) => {
    // The album list is held back, so the stand-in is all there is to see while it is measured.
    const release = await hold(page, '**/data/albums.json');
    await page.goto(route);
    await expect(page.locator('.gas-ph image')).toBeVisible();
    await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
    const ph = await standIn(page);
    // It takes no room and no input: the pane is as large as without it, and a click goes through to what is under it.
    expect(await page.locator('.gas-ph').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    const vp = page.viewportSize()!;
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([vp.width, vp.height]);
    release();
    await waitForMap(page);
    await waitForCameraIdle(page);
    // Where the map really put its albums, against where the stand-in said the same world points are.
    const s = await albumSpread(page);
    const [minX, minY, maxX, maxY] = B.cloud;
    const [x1, x99, medY] = B.span;
    const said = { minX: ph.at(minX, 0).x, maxX: ph.at(maxX, 0).x, x1: ph.at(x1, 0).x, x99: ph.at(x99, 0).x, top: ph.at(0, maxY).y, bottom: ph.at(0, minY).y, medY: ph.at(0, medY).y };
    const drawn = { minX: s.minX, maxX: s.maxX, x1: s.x1, x99: s.x99, top: s.minY, bottom: s.maxY, medY: s.medY };
    // Within a hundredth of the window's longer side, and never more than a few px on a phone.
    const tolerance = Math.max(vp.width, vp.height) * 0.01;
    const off = Object.fromEntries(Object.keys(said).map((k) => [k, Math.round((said[k as keyof typeof said] - drawn[k as keyof typeof drawn]) * 10) / 10]));
    console.log(`${info.project.name} ${route}: stand-in minus map, px: ${JSON.stringify(off)} (tolerance ${tolerance.toFixed(1)})`);
    for (const [k, d] of Object.entries(off)) expect(Math.abs(d), `${k}: the stand-in is ${d} px off the map`).toBeLessThanOrEqual(tolerance);
    // And the same scale: the picture is not stretched.
    const [west, south, east, north] = B.gas;
    expect(ph.box.width / ph.box.height).toBeCloseTo((east - west) / (north - south), 2);
    if (route === '/map' && isPhone(info)) expect(ph.box.width, 'a phone opens on a crop of the picture').toBeGreaterThan(vp.width);
  });
}

test('on a slow connection the script takes the nebula image over while it is still arriving, and the map draws it', async ({ page, context }) => {
  test.setTimeout(90_000);
  // Lighthouse's slow 4G as DevTools applies it (scripts/perf/first-frame.mjs): the page's scripts run while the
  // preloaded image is half downloaded. Chrome then fails response.blob() on it when the download ends, on a
  // phone-sized page every time; the image is read as bytes instead (lib/data/early.ts).
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 });
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') failed.push(m.text());
  });
  const requested: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === GAS) requested.push(r.url());
  });
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => typeof window.__rmr?.gasShownMs === 'number' || window.__rmr?.gas === 'ready' || window.__rmr?.gas === 'off', null, { timeout: 80_000 });
  const t = await page.evaluate((gas) => {
    const res = performance.getEntriesByType('resource').find((r) => new URL(r.name).pathname === gas) as PerformanceResourceTiming;
    return { asked: performance.getEntriesByName('rmr-gas-fetch')[0].startTime, start: res.startTime, end: res.responseEnd, decoded: performance.getEntriesByName('rmr-gas-decoded')[0]?.startTime ?? null, shown: window.__rmr!.gasShownMs ?? null };
  }, GAS);
  // The case this test is for: the script asked while the preload's download was under way.
  expect(t.asked).toBeGreaterThan(t.start);
  expect(t.asked).toBeLessThan(t.end);
  expect(failed).toEqual([]);
  expect(t.decoded, 'the image was decoded').not.toBeNull();
  expect(t.shown, 'the nebula was drawn').not.toBeNull();
  expect(requested).toHaveLength(1);
});

test('an album page shows a glow, not a picture, and it leaves when the map has drawn', async ({ page }) => {
  const release = await hold(page, '**/data/albums.json');
  await page.goto('/album/in-rainbows-radiohead');
  await expect(page.locator('.gas-ph.gas-ph--glow')).toHaveCount(1);
  await expect(page.locator('.gas-ph image')).toHaveCount(0);
  expect(await page.locator('.gas-ph').evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('radial-gradient');
  release();
  await waitForMap(page);
  await expect(page.locator('.gas-ph')).toHaveCount(0);
});

test('a late nebula does not hold the stars back: they show over the stand-in, and the nebula then covers it', async ({ page }) => {
  const release = await hold(page, `**${GAS}`);
  await page.goto('/map');
  // The map has drawn (stars only) and the nebula image is still on its way.
  await page.waitForFunction(() => (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20_000 });
  const canvas = page.locator('canvas.map-canvas');
  // Shown within a moment of its first frame, over the stand-in, which stays.
  await expect.poll(() => canvas.evaluate((c) => c.classList.contains('is-veiled')), { timeout: 3000 }).toBe(false);
  await expect.poll(() => canvas.evaluate((c) => getComputedStyle(c).opacity)).toBe('1');
  await expect(page.locator('.gas-ph image')).toBeVisible();
  expect(await page.locator('.gas-ph').evaluate((el) => el.className)).toBe('gas-ph gas-ph--over');
  expect(await page.evaluate(() => window.__rmr!.gasShownMs)).toBeUndefined();
  // The canvas is see-through where it has drawn no nebula: the middle of the pane is the stand-in's light, not the
  // empty sky (about 6).
  const vp = page.viewportSize()!;
  const shot = await page.screenshot({ clip: { x: vp.width / 2 - 60, y: vp.height / 2 - 60, width: 120, height: 120 } });
  const luma = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, shot.toString('base64'));
  expect(luma, 'the stand-in shows through the canvas').toBeGreaterThan(25);
  release();
  await waitForMap(page);
  expect(typeof (await page.evaluate(() => window.__rmr!.gasShownMs))).toBe('number');
  await expect(page.locator('.gas-ph')).toHaveCount(0);
});

test('with reduced motion nothing fades: the canvas and the stand-in change in one step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const release = await hold(page, '**/data/albums.json');
  await page.goto('/');
  await expect(page.locator('.gas-ph image')).toBeVisible();
  const ms = (v: string) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)));
  expect(ms(await page.locator('.gas-ph').evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(1);
  release();
  await page.waitForFunction(() => !!document.querySelector('canvas.map-canvas'), null, { timeout: 20_000 });
  expect(ms(await page.locator('canvas.map-canvas').evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(1);
  expect(await page.evaluate(() => document.getAnimations().filter((a) => !(a.effect as KeyframeEffect | null)?.target?.closest?.('.tw-layer')).some((a) => (a.effect?.getComputedTiming().duration as number) > 1))).toBe(false);
  await waitForMap(page);
  await expect(page.locator('.gas-ph')).toHaveCount(0);
});

test('without a theme the stand-in fades out and the stars stand on the plain sky', async ({ page }) => {
  await page.route('**/data/theme/theme.json', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' }));
  await page.goto('/map');
  await waitForMap(page);
  expect(await page.evaluate(() => window.__rmr!.gas)).toBe('off');
  await expect(page.locator('.gas-ph')).toHaveCount(0);
  expect(await page.locator('canvas.map-canvas').evaluate((c) => [c.classList.contains('is-veiled'), getComputedStyle(c).opacity])).toEqual([false, '1']);
});
