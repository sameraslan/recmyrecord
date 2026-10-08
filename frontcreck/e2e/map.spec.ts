import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { albumFragmentShader, albumVertexShader } from '../src/components/map/shaders/album';
import { COVER_MAX_PX, MAX_ZOOM } from '../src/components/map/state/zoomLimits';
import { ATLAS_SHEET_RE, lastAtlasSheet } from './data';
import { albumSpread, camera, coversSettled, isPhone, mapFrames, shot, twinkleOff, visibleAlbumPoint, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet, wholeMapMiss } from './helpers';

test('the map is a lazily loaded WebGL canvas that renders on demand', async ({ page }, info) => {
  const atlasRequests: string[] = [];
  page.on('request', (r) => {
    if (ATLAS_SHEET_RE.test(r.url())) atlasRequests.push(r.url());
  });
  await page.goto('/map');
  await expect(page).toHaveTitle(`${COPY.titles.map} · recmyrecord`);
  await waitForMap(page);
  const canvas = page.locator('canvas.map-canvas');
  await expect(canvas).toHaveAttribute('aria-label', COPY.map.canvasLabel);
  await expect(canvas).toHaveAttribute('tabindex', '0');
  expect(await page.evaluate(() => window.__rmr!.getState().webgl)).toBe('ok');
  await waitForCameraIdle(page);
  const f1 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  await page.waitForTimeout(1200); // nothing should happen: the idle window in which the map must not draw
  const f2 = await page.evaluate(() => window.__rmr!.frames ?? 0);
  expect(f2 - f1).toBeLessThanOrEqual(1);
  expect(atlasRequests).toEqual([]);
  await shot(page, info, 'explore');
  await canvas.focus();
  // Zoom in step by step: atlases load only once covers are about to show, then two more steps fade them in.
  for (let i = 0; i < 14 && atlasRequests.length === 0; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  await expect.poll(() => atlasRequests.length).toBeGreaterThan(0);
  for (let i = 0; i < 2; i++) await page.keyboard.press('+');
  await waitForCameraIdle(page);
  await waitForMapQuiet(page, 300); // covers have loaded and faded in
  await shot(page, info, 'explore-zoomed');
});

/**
 * The album shader is written per data set, with one sampler per atlas sheet (shaders/album.ts). Unit tests can
 * only read its source; here a real WebGL2 compiler takes it for one sheet, the four of the first data set, the
 * eleven of the 10,467-album catalog and the most there can be, and the map itself then draws covers with the sheets its own
 * data has, with nothing from WebGL in the console.
 */
test('the album shader compiles for every number of sheets, and the map draws covers with no WebGL error', async ({ page }) => {
  const glMessages: string[] = [];
  page.on('pageerror', (e) => glMessages.push(e.message));
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && /shader|program|webgl|gl_|glsl/i.test(m.text())) glMessages.push(m.text());
  });
  const atlasRequests: string[] = [];
  const atlasFailures: string[] = [];
  let atlasDone = 0;
  page.on('request', (r) => {
    if (ATLAS_SHEET_RE.test(r.url())) atlasRequests.push(r.url());
  });
  page.on('requestfinished', (r) => {
    if (ATLAS_SHEET_RE.test(r.url())) atlasDone++;
  });
  page.on('requestfailed', (r) => {
    if (ATLAS_SHEET_RE.test(r.url())) atlasFailures.push(r.url());
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);

  // What three.js puts in front of a ShaderMaterial's source under WebGL2, as far as this shader uses it.
  const VERT_PREFIX = '#version 300 es\nprecision highp float;\n#define attribute in\n#define varying out\n#define texture2D texture\nuniform mat4 modelViewMatrix;\nuniform mat4 projectionMatrix;\n';
  const FRAG_PREFIX = '#version 300 es\n#define varying in\nlayout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define texture2D texture\n';
  const sheetCounts = [1, 4, 11, 16];
  const sources = sheetCounts.map((sheets) => ({ sheets, vert: VERT_PREFIX + albumVertexShader(sheets), frag: FRAG_PREFIX + albumFragmentShader(sheets) }));
  const compiled = await page.evaluate((list) => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return [{ sheets: 0, error: 'no WebGL2 context', samplers: 0 }];
    const out = list.map(({ sheets, vert, frag }) => {
      const program = gl.createProgram()!;
      const logs: string[] = [];
      for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]] as const) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) logs.push(gl.getShaderInfoLog(shader) ?? 'compile failed');
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!logs.length && !gl.getProgramParameter(program, gl.LINK_STATUS)) logs.push(gl.getProgramInfoLog(program) ?? 'link failed');
      let samplers = 0;
      const uniforms = logs.length ? 0 : (gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number);
      for (let i = 0; i < uniforms; i++) if (gl.getActiveUniform(program, i)?.type === gl.SAMPLER_2D) samplers++;
      gl.deleteProgram(program);
      return { sheets, error: logs.length ? logs.join('\n') : null, samplers };
    });
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return out;
  }, sources);
  expect(compiled).toEqual(sheetCounts.map((sheets) => ({ sheets, error: null, samplers: sheets })));

  // The map's own program, with the sheets of its data: zoom in until covers are drawn from them.
  /** Distinct colours (4 bits a channel) on the map: under a hundred for dots, far more for covers. */
  const colours = async (): Promise<number> => {
    const png = await page.locator('canvas.map-canvas').screenshot();
    return page.evaluate(async (b64) => {
      // Not fetch(data:...): the site's CSP has no connect-src for it.
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
      const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < px.length; i += 4) seen.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
      return seen.size;
    }, png.toString('base64'));
  };
  const dots = await colours();
  await page.locator('canvas.map-canvas').focus();
  for (let i = 0; i < 14 && atlasRequests.length === 0; i++) {
    await page.keyboard.press('+');
    await waitForCameraIdle(page);
  }
  for (let i = 0; i < 3; i++) await page.keyboard.press('+');
  await waitForCameraIdle(page);
  await expect.poll(() => atlasRequests.length).toBeGreaterThan(0);
  // Sheets load one after another: wait until none is in flight and none has followed for a while.
  await expect(async () => {
    const asked = atlasRequests.length;
    await page.waitForTimeout(1200);
    expect(atlasRequests.length).toBe(asked);
    expect(atlasDone + atlasFailures.length).toBe(asked);
  }).toPass({ timeout: 30_000 });
  await waitForMapQuiet(page, 400); // the last sheet is uploaded and its covers have faded in
  expect(atlasFailures).toEqual([]);
  expect(new Set(atlasRequests).size, 'each sheet is requested once').toBe(atlasRequests.length);
  const covers = await colours();
  expect(covers, `covers show many more colours than dots (${dots})`).toBeGreaterThan(Math.max(3 * dots, 400));
  expect(glMessages).toEqual([]);
});

/**
 * The catalog's last atlas sheet is its eleventh (atlas-10.webp), the first whose number has two digits and the
 * only one that is partly empty. The album is chosen from the data and the served sheet at run time: the one on
 * that sheet with a cover id whose sprite has the most colours, so a cover cannot be mistaken for a dot or a tile.
 */
test('an album on the last atlas sheet shows its cover on the map', async ({ page }) => {
  const { sheet, albums } = lastAtlasSheet();
  expect(sheet, 'the catalog needs more than one atlas sheet').toBeGreaterThan(0);
  expect(albums.length, 'albums with a cover id on the last sheet').toBeGreaterThan(0);
  const sheetUrl = `/data/atlas-${sheet}.webp`;
  let sheetLoaded = false;
  page.on('requestfinished', (r) => {
    if (r.url().endsWith(sheetUrl)) sheetLoaded = true;
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  expect(sheetLoaded, 'no atlas sheet is loaded before covers show').toBe(false);

  // The sprite of every candidate, read from the served sheet: its number of colours (4 bits a channel) and the
  // mean colour of its middle (96 px cells, 32 a row).
  const sprite = await page.evaluate(
    async ([url, ids]) => {
      // Asked for under another URL than the map's, so the map's own request for the sheet is seen below.
      const bmp = await createImageBitmap(await (await fetch(`${url}?read`)).blob());
      const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      const cell = bmp.width / 32;
      let best: { id: number; colours: number; mean: number[] } | null = null;
      for (const id of ids) {
        const at = id % 1024;
        const x = (at % 32) * cell;
        const y = Math.floor(at / 32) * cell;
        const all = ctx.getImageData(x, y, cell, cell).data;
        const seen = new Set<number>();
        for (let i = 0; i < all.length; i += 4) seen.add(((all[i] >> 4) << 8) | ((all[i + 1] >> 4) << 4) | (all[i + 2] >> 4));
        const m = cell / 4;
        const mid = ctx.getImageData(x + m, y + m, cell - 2 * m, cell - 2 * m).data;
        const mean = [0, 0, 0];
        for (let i = 0; i < mid.length; i += 4) for (let c = 0; c < 3; c++) mean[c] += mid[i + c] / (mid.length / 4);
        // Bright enough in the middle to stand apart from the dark map behind it.
        if (Math.max(...mean) > 90 && (!best || seen.size > best.colours)) best = { id, colours: seen.size, mean };
      }
      return { best, sheetWidth: bmp.width };
    },
    [sheetUrl, albums.map((a) => a.id)] as const,
  );
  expect(sprite.sheetWidth).toBe(3072);
  expect(sprite.best, 'a colourful cover on the last sheet').not.toBeNull();
  const { id, colours, mean } = sprite.best!;
  expect(colours).toBeGreaterThan(60);

  // Fly to it and zoom in as far as the map goes, where no other cover overlaps it.
  const zoomOf = () => page.evaluate(() => window.__rmr!.map!.getCamera().zoom);
  for (let i = 0; i < 12; i++) {
    await page.evaluate((album) => window.__rmr!.map!.flyTo(album), id);
    await waitForCameraIdle(page);
    const before = await zoomOf();
    await page.evaluate(() => window.__rmr!.map!.zoomBy(1.6));
    await waitForCameraIdle(page);
    if ((await zoomOf()) <= before) break; // the maximum zoom
  }
  await page.evaluate((album) => window.__rmr!.map!.flyTo(album), id);
  await waitForCameraIdle(page);
  // The ceiling is a size on screen. The canvas runs under the header, and a zoom is relative to the canvas
  // height, so the ceiling is MAX_ZOOM for a canvas as tall as the map below the header (as opening.spec's
  // zoomAsRecorded): 111.47 on the 900 px canvas of this window, where 836 px are below the header.
  const underHeader = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.map-canvas')!.getBoundingClientRect();
    return canvas.height / (canvas.bottom - document.querySelector('#stage')!.getBoundingClientRect().top);
  });
  expect((await zoomOf()) * underHeader).toBeCloseTo(MAX_ZOOM, 6);
  await expect.poll(() => sheetLoaded, { timeout: 30_000 }).toBe(true);
  await waitForMapQuiet(page, 400); // the sheet is uploaded and its covers have faded in

  const p = (await page.evaluate((album) => window.__rmr!.map!.screenPoint(album), id))!;
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.classList.contains('map-canvas'), [p.x, p.y] as const), 'nothing covers the album').toBe(true);
  // The middle 32 CSS px of the 64 px cover on screen: the same half of the picture as the sprite's middle.
  const half = COVER_MAX_PX / 4;
  const png = (await page.screenshot()).toString('base64');
  const shown = await page.evaluate(
    async ([b64, x, y, r]) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
      const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const k = bmp.width / innerWidth;
      const d = ctx.getImageData(Math.round((x - r) * k), Math.round((y - r) * k), Math.round(2 * r * k), Math.round(2 * r * k)).data;
      const out = [0, 0, 0];
      const seen = new Set<number>();
      for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) out[c] += d[i + c] / (d.length / 4);
        seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
      }
      return { mean: out, colours: seen.size };
    },
    [png, p.x, p.y, half] as const,
  );
  const off = shown.mean.map((v, c) => Math.round(Math.abs(v - mean[c])));
  expect(Math.max(...off), `the map shows the sprite's colours there: sprite ${mean.map(Math.round)}, map ${shown.mean.map(Math.round)}`).toBeLessThanOrEqual(12);
  // A dot or a lettered tile is a few flat colours; a cover is many.
  expect(shown.colours).toBeGreaterThan(60);
});

test('keyboard pans and zooms, 0 gives the whole map', async ({ page }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.locator('canvas.map-canvas').focus();
  await page.keyboard.press('ArrowRight');
  expect((await camera(page)).x).toBeGreaterThan(start.x);
  await page.keyboard.press('ArrowUp');
  expect((await camera(page)).y).toBeGreaterThan(start.y);
  await page.keyboard.press('+');
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  // The map opens at the Overview (Task 0); 0 is the fit button, which gives the whole map.
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('0');
  await waitForCameraIdle(page);
  const again = await camera(page);
  expect(Math.hypot(again.x - whole.x, again.y - whole.y) + Math.abs(again.zoom - whole.zoom)).toBeLessThan(1e-6);
});

test('zoom buttons work', async ({ page }, info) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  expect(wholeMapMiss(await albumSpread(page), isPhone(info))).toEqual([]);
  const whole = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  const again = await camera(page);
  expect(Math.hypot(again.x - whole.x, again.y - whole.y) + Math.abs(again.zoom - whole.zoom)).toBeLessThan(1e-6);
});

test('the zoom corner is one closed stack of three buttons: zoom in, zoom out, whole map, and nothing above them', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const side = isMobile ? 44 : 40;
  const corner = page.locator('.map-zoom');
  await expect(corner.locator('> *')).toHaveCount(3);
  expect(await corner.locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([COPY.map.zoomIn, COPY.map.zoomOut, COPY.map.reset]);
  const boxes = await corner.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
  for (const b of boxes) expect([b.w, b.h]).toEqual([side, side]);
  // Each starts where the one above it ends, and the corner is exactly the three of them tall.
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].y - (boxes[i - 1].y + boxes[i - 1].h)).toBeCloseTo(0, 1);
  const box = (await corner.boundingBox())!;
  expect(box.y).toBeCloseTo(boxes[0].y, 1);
  expect(box.height).toBeCloseTo(3 * side, 1);
});

test.describe('desktop pointer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

  test('a pointer move over empty map draws one frame, a move onto an album at most three, and neither touches the zoom corner', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    // The sharper gas image may fade in about a second after the map settles, and a glint is a timer: neither
    // may draw or write while the moves are counted.
    await waitForGasSharpSettled(page);
    await twinkleOff(page);
    // Twenty albums across the map, clear of the controls, and twenty-one points with no album within 12 px.
    const albums = await page.evaluate(() => {
      const api = window.__rmr!.map!;
      const out: { x: number; y: number }[] = [];
      for (let id = 0; out.length < 20; id += 37) {
        const p = api.screenPoint(id);
        if (!p) break;
        if (p.x < 320 || p.y < 240 || p.x > innerWidth - 140 || p.y > innerHeight - 140) continue;
        if (document.elementFromPoint(p.x, p.y)?.classList.contains('map-canvas')) out.push({ x: Math.round(p.x), y: Math.round(p.y) });
      }
      return out;
    });
    expect(albums.length).toBe(20);
    const free = await page.evaluate(() => {
      const api = window.__rmr!.map!;
      const pts: { x: number; y: number }[] = [];
      for (let id = 0; ; id++) {
        const p = api.screenPoint(id);
        if (!p) break;
        pts.push(p);
      }
      const open: { x: number; y: number; d: number }[] = [];
      for (let y = 220; y <= innerHeight - 220; y += 10) {
        for (let x = 320; x <= innerWidth - 320; x += 10) {
          let d = Infinity;
          for (const p of pts) {
            d = Math.min(d, Math.max(Math.abs(p.x - x), Math.abs(p.y - y)));
            if (d < 12) break;
          }
          if (d >= 12 && document.elementFromPoint(x, y)?.classList.contains('map-canvas')) open.push({ x, y, d });
        }
      }
      open.sort((p, q) => q.d - p.d || p.y - q.y || p.x - q.x);
      const out: { x: number; y: number }[] = [];
      for (const f of open) {
        if (out.length >= 21) break;
        if (out.every((o) => Math.max(Math.abs(o.x - f.x), Math.abs(o.y - f.y)) >= 40)) out.push({ x: f.x, y: f.y });
      }
      return out;
    });
    expect(free.length, 'points with no album within 12 px').toBe(21);
    /** Walks a path, one move at a time, each left to settle: the frames each move drew, and after how many of
     * the moves an album was hovered (the canvas shows the pointer cursor). */
    const walk = async (path: { x: number; y: number }[]): Promise<{ frames: number[]; hovers: number }> => {
      // From a point that hovers nothing, so the first move ends no hover either.
      await page.mouse.move(free[20].x, free[20].y);
      await waitForMapQuiet(page, 200);
      const frames: number[] = [];
      let hovers = 0;
      for (const p of path) {
        const f = await mapFrames(page);
        await page.mouse.move(p.x, p.y);
        await waitForMapQuiet(page, 200, { since: f });
        frames.push((await mapFrames(page)) - f);
        if (await page.evaluate(() => document.querySelector<HTMLCanvasElement>('canvas.map-canvas')!.style.cursor === 'pointer')) hovers += 1;
      }
      return { frames, hovers };
    };
    await page.evaluate(() => {
      const w = window as unknown as { __cornerChanges: number };
      w.__cornerChanges = 0;
      new MutationObserver((r) => (w.__cornerChanges += r.length)).observe(document.querySelector('.map-zoom')!, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    // Over albums the hover changes with every move. How many frames a hover draws depends on whether its 80 ms
    // label timer falls into a frame already asked for, so those are bounded: the move, the change of hover, the label.
    const over = await walk(albums);
    expect(over.hovers, 'moves that ended on an album').toBeGreaterThan(5);
    for (const n of over.frames) expect(n, `frames for a move onto an album (${over.frames.join(', ')})`).toBeLessThanOrEqual(3);
    // Over empty map a move changes no hover: one frame, the pointer's.
    const empty = await walk(free.slice(0, 20));
    expect(empty.hovers, 'moves over empty map that hovered an album').toBe(0);
    expect(empty.frames, 'frames per pointer move over empty map').toEqual(free.slice(0, 20).map(() => 1));
    expect(await page.evaluate(() => (window as unknown as { __cornerChanges: number }).__cornerChanges), 'changes in the zoom corner over 40 pointer moves').toBe(0);
  });

  test('hover shows a label, drag pans, wheel zooms, click selects and flies', async ({ page }, info) => {
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const p = await visibleAlbumPoint(page);
    await page.mouse.move(p.x, p.y);
    const tip = page.locator('.map-tip');
    await expect(tip).toHaveCSS('opacity', '1');
    await expect(tip.locator('.t')).not.toBeEmpty();
    await coversSettled(page, '.map-tip');
    await shot(page, info, 'explore-hover');
    const vp = page.viewportSize()!;
    await page.mouse.move(vp.width / 2, vp.height / 2);
    const before = await camera(page);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 + 80, vp.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await waitForCameraIdle(page);
    expect((await camera(page)).x).toBeLessThan(before.x);
    const z0 = (await camera(page)).zoom;
    await page.mouse.wheel(0, -300);
    await waitForCameraIdle(page);
    expect((await camera(page)).zoom).toBeGreaterThan(z0);
    await page.keyboard.press('0');
    await waitForCameraIdle(page);
    const q = await visibleAlbumPoint(page);
    const z1 = (await camera(page)).zoom;
    await page.mouse.click(q.x, q.y);
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
    await waitForCameraIdle(page);
    expect((await camera(page)).zoom).toBeGreaterThan(z1);
    // Covers show after the fly: the shader draws the pick large and framed (explore.spec), not the DOM ring.
    await expect(page.locator('.map-sel')).toHaveCSS('opacity', '0');
    // Back among dots, the ring with its centre dot marks it.
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: COPY.map.zoomOut }).click();
    await waitForCameraIdle(page);
    await expect(page.locator('.map-sel')).toHaveCSS('opacity', '1');
  });
});

test.describe('phone touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('tap selects an album', async ({ page }, info) => {
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const p = await visibleAlbumPoint(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect.poll(() => page.evaluate(() => window.__rmr!.getState().selected)).not.toBeNull();
    await waitForCameraIdle(page);
    await shot(page, info, 'explore-tap');
  });
});

test('Home shows the map dimmed and not interactive', async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('tabindex', '-1');
  // A backdrop that takes no input must not announce drag and key controls.
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('aria-label', COPY.map.canvasLabelStatic);
  await expect(page.getByRole('img', { name: COPY.map.canvasLabel })).toHaveCount(0);
  // R3F puts an inline pointer-events style on its wrapper; the canvas itself must inherit `none` here.
  expect(await page.locator('canvas.map-canvas').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(page.getByRole('button', { name: COPY.map.zoomIn })).toHaveCount(0);
  // The same canvas becomes the interactive map on /map.
  await page.getByRole('navigation', { name: COPY.nav.label }).getByRole('link', { name: COPY.nav.map, exact: true }).click();
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'explore');
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('aria-label', COPY.map.canvasLabel);
  await expect(page.locator('canvas.map-canvas')).toHaveAttribute('tabindex', '0');
});
