import { expect, test } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { albumFragmentShader, albumVertexShader } from '../src/components/map/shaders/album';
import { ATLAS_SHEET_RE } from './data';
import { camera, coversSettled, shot, visibleAlbumPoint, waitForCameraIdle, waitForMap, waitForMapQuiet } from './helpers';

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
 * only read its source; here a real WebGL2 compiler takes it for one sheet, today's four, the eleven of the
 * 10,467-album catalog and the most there can be, and the map itself then draws covers with the sheets its own
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

test('keyboard pans and zooms, 0 resets', async ({ page }) => {
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
  expect((await camera(page)).zoom).toBeCloseTo(start.zoom, 3);
});

test('zoom buttons work', async ({ page }) => {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const start = await camera(page);
  await page.getByRole('button', { name: COPY.map.zoomIn }).click();
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeGreaterThan(start.zoom);
  await page.getByRole('button', { name: COPY.map.reset }).click();
  await waitForCameraIdle(page);
  expect((await camera(page)).zoom).toBeCloseTo(start.zoom, 3);
});

test.describe('desktop pointer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only');

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
