import { expect, test, type Page } from '@playwright/test';
import { THEME_BAKE } from '../src/lib/data/theme.generated';
import { albumSpread, contrastOverBackdrop, isPhone, waitForAnimations, waitForCameraIdle, waitForMap } from './helpers';

/** Issue 78: the map's first picture. The server HTML carries a soft stand-in nebula, placed where the map will
 * draw the real one; the page's script asks for what the map needs side by side, behind the page's own scripts and
 * the album list that search needs; the canvas shows once it has the nebula. */

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

test('the server HTML carries the stand-in nebula and asks for none of the map\'s files itself', async ({ request }) => {
  for (const [route, kind] of [['/', 'fit'], ['/map', 'over'], ['/about', 'fit'], ['/album/in-rainbows-radiohead', 'glow']] as const) {
    const html = await (await request.get(route)).text();
    // No preload link for a data file or a nebula image: a preload starts with the page's own scripts, at their
    // priority, and on a slow connection the search field was usable 0.8 s later for it. The page's script asks.
    expect(html.match(/<link[^>]*rel="preload"[^>]*as="fetch"[^>]*>/g) ?? [], route).toEqual([]);
    expect(html.match(/<link[^>]*href="\/data\/[^"]*"[^>]*>/g) ?? [], route).toEqual([]);
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
  test(`${route}: every file is downloaded once, by the page's script, and nothing waits for the WebGL probe`, async ({ page }, info) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      const p = new URL(r.url()).pathname;
      if (isMapFile(p)) requested.push(p);
    });
    const complaints: string[] = [];
    page.on('console', (m) => {
      // (Chrome says so when a preloaded file was not used, or was asked for again in another way: there is none.)
      if (/preload/i.test(m.text())) complaints.push(m.text());
      if (m.type() === 'error') complaints.push(m.text());
    });
    page.on('pageerror', (e) => complaints.push(e.message));
    await page.goto(route, { waitUntil: 'load' });
    await waitForMap(page);
    await page.waitForTimeout(1500);
    for (const p of EARLY) expect(requested.filter((r) => r === p), p).toHaveLength(1);
    // Home loads one nebula image; the map all three, the other two after the first is on screen. No sharper one
    // on this software renderer.
    const others = requested.filter((r) => !EARLY.includes(r));
    expect(others.sort()).toEqual(route === '/' ? [] : [`/data/theme/gas-mood.${THEME_BAKE.stops.mood.hash[0]}.webp`, `/data/theme/gas-sonic.${THEME_BAKE.stops.sonic.hash[0]}.webp`]);
    expect(complaints).toEqual([]);
    const t = await page.evaluate((gasPath) => {
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
        albumsEnd: res('/data/albums.json')?.responseEnd ?? null,
        albumsBy: res('/data/albums.json')?.initiatorType ?? null,
        gas: res(gasPath)?.startTime ?? null,
        gasBy: res(gasPath)?.initiatorType ?? null,
        searchFocused: document.activeElement?.getAttribute('role') === 'combobox',
      };
    }, GAS);
    for (const [name, v] of Object.entries(t)) expect(v, name).not.toBeNull();
    // Asked for by the page's script, the album list first.
    expect([t.albumsBy, t.gasBy]).toEqual(['fetch', 'fetch']);
    expect(t.albums!).toBeLessThanOrEqual(t.gas!);
    expect(t.dataStart!).toBeLessThan(t.warm!);
    if (route === '/' && !isPhone(info)) {
      // Home at desktop size puts the visitor in the search field: the map's downloads wait for the album list.
      expect(t.searchFocused).toBe(true);
      for (const k of ['gas', 'gasFetch', 'chunkStart'] as const) expect(t[k]!, k).toBeGreaterThanOrEqual(t.albumsEnd!);
    } else {
      // Nothing waits for the WebGL warm-up and probe, nor for the album list: the nebula image and the map's code
      // were asked for before the probe ended.
      for (const k of ['albums', 'gas', 'gasFetch', 'chunkStart'] as const) expect(t[k]!, k).toBeLessThan(t.warm!);
    }
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

test('the search path comes first: with a visitor at the search field the map\'s downloads wait for the album list; otherwise they run beside it', async ({ page }, info) => {
  // The album list is held back for a while, as a slow connection would hold it.
  const release = await hold(page, '**/data/albums.json');
  const asked: string[] = [];
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (/^\/data\//.test(p)) asked.push(p);
  });
  const mapFiles = [GAS, '/data/positions.json', '/data/theme/theme.json'];
  // Home at desktop size focuses the search field as the page opens.
  await page.goto('/');
  const focused = !isPhone(info);
  if (focused) await expect(page.getByRole('combobox', { name: 'Search albums or artists' }).first()).toBeFocused();
  await page.waitForFunction(() => performance.getEntriesByName('rmr-webgl-warm').length > 0, null, { timeout: 20_000 });
  await page.waitForTimeout(600);
  if (focused) {
    // Nothing of the map is on the wire beside the album list (and the tiny list of descriptor names with it), and
    // the map's code has not been asked for.
    expect(asked.filter((p) => mapFiles.includes(p))).toEqual([]);
    expect(await page.evaluate(() => performance.getEntriesByName('rmr-chunk-start').length)).toBe(0);
  } else {
    // Nobody is at the search field: everything runs beside the album list.
    await expect.poll(() => mapFiles.every((p) => asked.includes(p))).toBe(true);
    expect(await page.evaluate(() => performance.getEntriesByName('rmr-chunk-start').length)).toBe(1);
  }
  expect(asked).toContain('/data/albums.json');
  release();
  await waitForMap(page);
  for (const p of [...mapFiles, '/data/albums.json']) expect(asked.filter((a) => a === p), p).toHaveLength(1);
  // On /map nobody is at the search field at either size: everything beside the album list.
  const release2 = await hold(page, '**/data/albums.json');
  asked.length = 0;
  await page.goto('/map');
  await expect.poll(() => mapFiles.every((p) => asked.includes(p)), { timeout: 20_000 }).toBe(true);
  release2();
});

test('when the album list fails the stand-in leaves with the error panel, and a retry that works shows the map', async ({ page }) => {
  let failing = true;
  await page.route('**/data/albums.json', (route) => (failing ? route.abort() : route.continue()));
  await page.goto('/map');
  const panel = page.locator('.map-msg');
  await expect(panel).toBeVisible();
  // No soft nebula behind a message that says the map could not load, no hint line over nothing, and no canvas.
  await expect(page.locator('.gas-ph')).toHaveCount(0);
  await expect(page.locator('.map-hint')).toHaveCount(0);
  await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
  failing = false;
  await panel.getByRole('button').click();
  await waitForMap(page);
  await expect(panel).toHaveCount(0);
  await expect(page.locator('canvas.map-canvas')).toBeVisible();
  expect(await page.locator('canvas.map-canvas').evaluate((c) => [c.classList.contains('is-veiled'), getComputedStyle(c).opacity])).toEqual([false, '1']);
  expect(typeof (await page.evaluate(() => window.__rmr!.gasShownMs))).toBe('number');
});

test('when the map\'s code fails to download the error panel shows, and its retry downloads it and shows the map', async ({ page }) => {
  // The map's code is the chunk with three.js in it. It is asked for right after first paint; here the first
  // request for it is dropped, as a connection that breaks would.
  let failing = true;
  const dropped: string[] = [];
  const asked: string[] = [];
  await page.route('**/_next/static/chunks/*.js', async (route) => {
    const res = await route.fetch();
    const three = (await res.text()).includes('WebGLRenderer');
    if (three) asked.push(new URL(route.request().url()).pathname);
    if (three && failing) {
      dropped.push(route.request().url());
      await route.abort();
    } else await route.fulfill({ response: res });
  });
  await page.goto('/map');
  const panel = page.locator('.map-msg');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  expect(dropped.length).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.gas-ph')).toHaveCount(0);
  await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
  failing = false;
  const before = asked.length;
  await panel.getByRole('button').click();
  await waitForMap(page);
  // The retry asked for the code again (a failed download is not remembered), and the map is there.
  expect(asked.length).toBeGreaterThan(before);
  await expect(panel).toHaveCount(0);
  await expect(page.locator('canvas.map-canvas')).toBeVisible();
  expect(typeof (await page.evaluate(() => window.__rmr!.gasShownMs))).toBe('number');
});

test('the zoom buttons come in with the map, never before it; the hint line is there from the first paint', async ({ page, request }, info) => {
  // In the server HTML, with the stand-in: before any script.
  expect(await (await request.get('/map')).text()).toContain('class="map-hint"');
  // The nebula image is held back, so the map shows its stars over the stand-in: the moment the controls must wait for.
  const release = await hold(page, `**${GAS}`);
  await page.addInitScript(() => {
    // Every frame: is the canvas shown, and are the controls that need the map? One seen while the canvas is not is
    // the bug. (The hint line needs no map and is allowed.)
    const w = window as unknown as { __early: string[] };
    w.__early = [];
    const look = () => {
      const canvas = document.querySelector('canvas.map-canvas');
      const mapShown = !!canvas && !canvas.classList.contains('is-veiled');
      for (const sel of ['.map-zoom']) {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el || mapShown) continue;
        const cs = getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0) w.__early.push(`${sel} at ${Math.round(performance.now())}`);
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.goto('/map');
  await expect.poll(() => page.locator('canvas.map-canvas').evaluate((c) => c.classList.contains('is-veiled')).catch(() => true), { timeout: 20_000 }).toBe(false);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-shown', '1');
  await expect(page.locator('.map-zoom')).toBeVisible();
  if (!isPhone(info)) await expect(page.locator('.map-hint')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __early: string[] }).__early)).toEqual([]);
  release();
  await waitForMap(page);
});

test('the hint line reads over the stand-in as well as it does over the drawn map', async ({ page }, info) => {
  test.skip(isPhone(info), 'a phone has no hint line');
  const release = await hold(page, '**/data/albums.json');
  await page.goto('/map');
  await expect(page.locator('.gas-ph image')).toBeVisible();
  await expect(page.locator('.map-hint')).toBeVisible();
  await expect(page.locator('canvas.map-canvas')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await waitForAnimations(page);
  const [early] = await contrastOverBackdrop(page, '.map-pane', ['.map-hint'], { box: 'text' });
  release();
  await waitForMap(page);
  await waitForCameraIdle(page);
  const [settled] = await contrastOverBackdrop(page, '.map-pane', ['.map-hint'], { box: 'text' });
  console.log(`hint contrast: over the stand-in ${early.ratio.toFixed(2)}, over the map ${settled.ratio.toFixed(2)}`);
  expect(early.ratio).toBeGreaterThanOrEqual(4.5);
  // No worse than on the settled page (whose backdrop has stars in it, so it is the harder of the two).
  expect(early.ratio).toBeGreaterThanOrEqual(settled.ratio - 0.3);
});

test('Home while the stand-in is up: one soft pad behind the text, which reads as well as on the drawn page; then the page\'s own pads', async ({ page }) => {
  const release = await hold(page, '**/data/albums.json');
  await page.goto('/');
  await expect(page.locator('.gas-ph image')).toBeVisible();
  await expect(page.locator('.map-pane')).toHaveAttribute('data-shown', '0');
  const pads = () =>
    page.evaluate(() => {
      const hero = document.querySelector('.hero')!;
      const row = document.querySelector('.hero-row')!;
      const o = (el: Element, pseudo: string) => getComputedStyle(el, pseudo).opacity;
      return { soft: o(hero, '::after'), softShown: getComputedStyle(hero, '::after').visibility, own: o(hero, '::before'), links: o(row, '::before') };
    });
  expect(await pads()).toEqual({ soft: '1', softShown: 'visible', own: '0', links: '0' });
  await page.evaluate(() => document.fonts.ready);
  const texts = ['.hero .lede', '.hero-row a', '.hero-row button'];
  const early = await contrastOverBackdrop(page, '.home', texts, { box: 'text' });
  // The grain lies over the stand-in only, on its own layer.
  expect(await page.locator('.gas-ph').evaluate((el) => getComputedStyle(el, '::after').backgroundImage)).toContain('data:image/png');
  release();
  await waitForMap(page);
  await waitForAnimations(page);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-shown', '1');
  // Settled: the page's own two pads, and the soft one not painted.
  expect(await pads()).toEqual({ soft: '0', softShown: 'hidden', own: '1', links: '1' });
  const settled = await contrastOverBackdrop(page, '.home', texts, { box: 'text' });
  console.log(`home text contrast, stand-in / drawn: ${texts.map((t, i) => `${t} ${early[i].ratio.toFixed(1)} / ${settled[i].ratio.toFixed(1)}`).join(', ')}`);
  for (const r of early) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
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
