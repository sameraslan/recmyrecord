import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, contrastOverBackdrop, mapFrames, panBrightestGasUnder, tabTo, twinkleOff, waitForAnimations, waitForCameraIdle, waitForGasSharpSettled, waitForMap } from './helpers';

const GLASS = 'blur(22px) saturate(1.2) brightness(0.58)';
/** Solid is fully solid; the browser reports rgba(10, 9, 14, 1) as rgb(10, 9, 14). */
const SOLID = 'rgb(10, 9, 14)';
/** The album whose accent has the lowest contrast on the page colour in the catalog of 10,467 (#d84b4c, 4.84:1). */
const WEAKEST = '/album/introducing-hedzoleh-soundz-hugh-masekela';

const styleOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { filter: cs.backdropFilter, bg: cs.backgroundColor };
  });

test('panels are glass on wide screens and solid on phones; the Home header is clear', async ({ page, isMobile }) => {
  await page.goto('/map');
  await waitForMap(page);
  await expect(page.locator('.map-zoom button').first()).toBeVisible();
  if (isMobile) {
    for (const sel of ['.mode.panel', 'header.top', '.map-zoom button']) expect(await styleOf(page, sel), sel).toEqual({ filter: 'none', bg: SOLID });
  } else {
    expect(await styleOf(page, '.mode.panel')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
    expect(await styleOf(page, '.map-zoom button')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
    expect(await styleOf(page, 'header.top')).toEqual({ filter: GLASS, bg: 'rgba(7, 6, 10, 0.58)' });
  }
  await page.goto('/album/in-rainbows-radiohead');
  // The phone album list is opaque; the desktop panel is glass.
  expect(await styleOf(page, 'section.album')).toEqual(isMobile ? { filter: 'none', bg: 'rgb(7, 6, 10)' } : { filter: GLASS, bg: 'rgba(8, 7, 11, 0.7)' });
  await page.goto('/');
  expect(await styleOf(page, 'header.top')).toEqual({ filter: 'none', bg: 'rgba(0, 0, 0, 0)' });
  // The Home search field, when it does not hold the focus (on desktop it takes it on load; the next test is that case).
  await page.locator('.combo--hero input').evaluate((el) => (el as HTMLElement).blur());
  // Polled: the field's background eases over .2 s (search.css .combo-field).
  await expect.poll(() => styleOf(page, '.combo--hero .combo-field')).toEqual(isMobile ? { filter: 'none', bg: SOLID } : { filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
  await page.goto('/about');
  expect(await styleOf(page, '.about')).toEqual(isMobile ? { filter: 'none', bg: SOLID } : { filter: GLASS, bg: 'rgba(8, 7, 11, 0.7)' });
});

test('the focused Home search field stays glass, and its text and placeholder keep 4.5:1 over the brightest gas', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone does not focus the field on load, and its field is solid');
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off'; // the full shader: the test reads what the gas paints behind the field
  });
  await page.goto('/');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  const input = page.locator('.combo--hero input');
  await expect(input).toBeFocused();
  // See-through as in the approved picture (final-home.jpg), with the focus border of every search field (lamp).
  await expect.poll(() => styleOf(page, '.combo--hero .combo-field')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
  await expect(page.locator('.combo--hero .combo-field')).toHaveCSS('border-top-color', 'rgb(241, 236, 228)');
  // The worst case: the brightest gas on screen moved under the field (found with the hero and its dark pad hidden).
  const gas = await panBrightestGasUnder(page, '.combo--hero .combo-field', '.home, header.top');
  // Gas, not sky (the veil of Home dims it: a window as wide as the field reaches about 0.2 here, the sky is under 0.02).
  expect(gas, 'mean luminance of the gas moved under the field').toBeGreaterThan(0.15);
  // Hiding the hero to look for the gas took the focus away: back in the field, and still glass with the lamp border.
  await input.focus();
  await expect(input).toBeFocused();
  await expect.poll(() => styleOf(page, '.combo--hero .combo-field')).toEqual({ filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
  await expect(page.locator('.combo--hero .combo-field')).toHaveCSS('border-top-color', 'rgb(241, 236, 228)');
  const [typed] = await contrastOverBackdrop(page, '.home', ['.combo--hero input']);
  // The placeholder is what an empty field shows: the same backdrop, measured with the placeholder's own colour.
  const ash = await input.evaluate((el) => getComputedStyle(el, '::placeholder').color);
  const style = await page.addStyleTag({ content: `.combo--hero input { color: ${ash} !important; }` });
  const [placeholder] = await contrastOverBackdrop(page, '.home', ['.combo--hero input']);
  await style.evaluate((el) => (el as Element).remove());
  console.log(`focused Home field over the brightest gas (mean luminance ${gas.toFixed(2)}): text ${typed.ratio.toFixed(2)}, placeholder ${placeholder.ratio.toFixed(2)} (${ash})`);
  expect(typed.ratio, 'typed text').toBeGreaterThanOrEqual(4.5);
  expect(placeholder.ratio, 'placeholder').toBeGreaterThanOrEqual(4.5);
});

test('with reduced transparency the panels are solid and unblurred', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones are already solid');
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  await expect(page.locator('.map-zoom button').first()).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches), 'the browser must emulate the preference').toBe(true);
  for (const sel of ['.mode.panel', 'section.album', 'header.top', '.map-zoom button', '.map-explore']) {
    // Polled: the header's background eases over --dur (shell.css .top), so the first read can be mid-change.
    await expect.poll(() => styleOf(page, sel), { message: sel }).toEqual({ filter: 'none', bg: SOLID });
  }
});

test('the built CSS keeps the Safari prefix and the no-support fallback', async ({ page }) => {
  await page.goto('/map');
  const cssText = await page.evaluate(async () => {
    const linked = await Promise.all([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => fetch(l.href).then((r) => r.text())));
    return [...linked, ...[...document.querySelectorAll('style')].map((s) => s.textContent ?? '')].join('\n');
  });
  // Read as text: Chromium drops the prefixed property from the parsed rules, Safari before 18 needs it.
  expect(cssText).toMatch(/-webkit-backdrop-filter:\s*var\(--glass-blur\)/);
  expect(cssText).toMatch(/[;{]\s*backdrop-filter:\s*var\(--glass-blur\)/);
  // The build's minifier writes the two alternatives in either order (prefixed first today); both must be there,
  // and the block must still switch the blur off.
  const noSupport = /@supports\s+not\s*\(\((-webkit-)?backdrop-filter:\s*blur\(1px\)\)\s*or\s*\((-webkit-)?backdrop-filter:\s*blur\(1px\)\)\)\s*\{\s*:root\s*\{\s*--glass-blur:\s*none/.exec(cssText);
  expect(noSupport, 'the @supports not (backdrop-filter) block').not.toBeNull();
  expect([noSupport![1] ?? '', noSupport![2] ?? ''].sort(), 'one plain and one prefixed alternative').toEqual(['', '-webkit-']);
  expect(cssText).toMatch(/prefers-reduced-transparency:\s*reduce/);
});

test('text on the panels keeps 4.5:1 over the map, with the weakest accent', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off'; // the full shader: the test reads what the gas paints behind the panels
    // No glints on either page this test loads (a glint is a bright spot at a random place and time). Set before
    // the page's scripts, as twinkleOff does on a loaded page: it holds for the album and for /map below.
    window.__rmrTwinkle = 'off';
  });
  await page.goto(WEAKEST);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page); // measure the image that stays
  const results = await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.seed-title', '.tags li', '.recs-h', '.rec-n', '.rec-title', '.rec-artist', '.rec-shared']);
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  // The hint is desktop only (display: none under 900 px).
  results.push(...(await contrastOverBackdrop(page, '.map-ui', ['.mode .cap', '.mode-stops button', '.mode-note', ...(isMobile ? [] : ['.map-hint'])])));
  console.log(`glass contrast: ${results.map((r) => `${r.selector} ${r.ratio.toFixed(2)}`).join(', ')}`);
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});

test('the canvas stays still at rest with the glass panels on', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no glass');
  // An idle guard with glass confirmed on: the map draws no frame in 3 s, on the map alone and beside an open album
  // (the widest glass surface). It counts canvas draws only; what the blur costs the compositor is a timing matter.
  for (const url of ['/map', WEAKEST]) {
    await page.goto(url);
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    expect((await styleOf(page, '.mode.panel')).filter, url).toBe(GLASS);
    await waitForGasSharpSettled(page);
    const before = await mapFrames(page);
    await page.waitForTimeout(3000);
    expect((await mapFrames(page)) - before, `${url}: frames drawn in 3 idle seconds`).toBe(0);
  }
});

test.describe('the hint band and the hover label', () => {
  test.skip(({ isMobile }) => isMobile, 'the hint and the hover label are desktop only');

  /** Luminance (0 to 1) of the brightest pixel inside the first element matching `selector`. */
  async function brightestPixel(page: Page, selector: string): Promise<number> {
    const png = (await page.screenshot()).toString('base64');
    return page.evaluate(
      async ([data, sel]) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const k = img.width / innerWidth;
        const d = ctx.getImageData(Math.ceil(r.x * k), Math.ceil(r.y * k), Math.floor(r.width * k), Math.floor(r.height * k)).data;
        const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        let max = 0;
        for (let i = 0; i < d.length; i += 4) max = Math.max(max, 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
        return max;
      },
      [png, selector] as const,
    );
  }
  const luminanceOf = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((el) => {
      const [r, g, b] = (getComputedStyle(el).color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    });

  test('the hover label is solid, and lies over the hint band when a star near the bottom is hovered', async ({ page }) => {
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off';
    });
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await expect(page.locator('.map-hint')).toBeVisible();
    // A star in the bottom 60 px of the map, on the canvas itself (not under a panel or the zoom buttons).
    const star = await page.evaluate(() => {
      const api = window.__rmr!.map!;
      const bottom = document.querySelector('canvas.map-canvas')!.getBoundingClientRect().bottom;
      for (let id = 0; id < 4100; id++) {
        const p = api.screenPoint(id);
        if (!p || p.y < bottom - 60 || p.y > bottom - 12 || p.x < 320 || p.x > innerWidth - 320) continue;
        if (document.elementFromPoint(p.x, p.y)?.classList.contains('map-canvas')) return p;
      }
      return null;
    });
    expect(star, 'an album in the bottom 60 px of the map').not.toBeNull();
    await page.mouse.move(star!.x, star!.y);
    const tip = page.locator('.map-tip');
    await expect(tip).toHaveCSS('opacity', '1');
    await expect(tip.locator('.t')).not.toBeEmpty();
    await waitForCameraIdle(page);
    // The label is inside the band's height, where the band would dim it.
    const [tipBox, hintBox] = [(await tip.boundingBox())!, (await page.locator('.map-hint').boundingBox())!];
    expect(tipBox.y + tipBox.height).toBeGreaterThan(hintBox.y + hintBox.height / 2);
    // Solid, no blur: it moves on every hover frame (dropped for speed: glass on the hover label).
    expect(await styleOf(page, '.map-tip')).toEqual({ filter: 'none', bg: SOLID });
    // Above the layer the band is in.
    const z = (sel: string) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(await z('.map-tip')).toBeGreaterThan(await z('.map-ui'));
    // Nothing dims its text: the brightest pixel of each line is close to the line's own colour.
    expect(await brightestPixel(page, '.map-tip .t')).toBeGreaterThanOrEqual(0.85 * (await luminanceOf(page, '.map-tip .t')));
    expect(await brightestPixel(page, '.map-tip .a')).toBeGreaterThanOrEqual(0.7 * (await luminanceOf(page, '.map-tip .a')));
    const ratios = await contrastOverBackdrop(page, '.map-tip', ['.map-tip .t', '.map-tip .a']);
    console.log(`hover label over the hint band: ${ratios.map((r) => `${r.selector} ${r.ratio.toFixed(2)}`).join(', ')}`);
    for (const r of ratios) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
  });

  test('the hint keeps 4.5:1 with the brightest gas on screen under its words', async ({ page }) => {
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off';
    });
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await waitForGasSharpSettled(page);
    const gas = await panBrightestGasUnder(page, '.map-hint');
    // Cream gas, not sky: otherwise this measures nothing.
    expect(gas, 'mean luminance of the gas moved under the hint').toBeGreaterThan(0.4);
    await expect(page.locator('.map-hint')).toBeVisible();
    const [r] = await contrastOverBackdrop(page, '.map-ui', ['.map-hint'], { box: 'text' });
    console.log(`hint over the brightest gas (mean luminance ${gas.toFixed(2)}): ${r.ratio.toFixed(2)}`);
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('a hint that wraps to two lines keeps 4.5:1 on both, over a white backdrop', async ({ page }) => {
    // The hint shows in Explore only (none beside an open album, as in the approved picture), where its one
    // sentence fits on a line at every desktop width. The band is still built for a wrapped hint, whose first line
    // starts higher in it (contrast.test.ts ties the band's stop to the padding): so the wrap is forced here, by
    // narrowing the room for the words and leaving the band itself as it is.
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    const hint = page.locator('.map-hint');
    await expect(hint).toBeVisible();
    const band = await hint.evaluate((el) => ({ width: el.getBoundingClientRect().width, image: getComputedStyle(el).backgroundImage }));
    await page.addStyleTag({ content: '.map-hint { padding-right: calc(100% - 240px) !important; }' });
    expect(await hint.evaluate((el) => ({ width: el.getBoundingClientRect().width, image: getComputedStyle(el).backgroundImage }))).toEqual(band);
    const lines = await hint.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight);
    });
    expect(lines, 'the hint wraps in this room').toBeGreaterThan(1.5);
    // The worst backdrop there is: white in place of the map.
    await page.addStyleTag({ content: '.map-host { visibility: hidden !important; } .map-pane { background: #fff !important; }' });
    const [r] = await contrastOverBackdrop(page, '.map-ui', ['.map-hint'], { box: 'text' });
    console.log(`wrapped hint over white: ${r.ratio.toFixed(2)}`);
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
  });
});

test('header text keeps 4.5:1 with the brightest gas on screen behind the bar', async ({ page, isMobile }) => {
  // The map runs under the header: on wide screens the bar is glass over the gas, on a phone it is solid.
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  await twinkleOff(page);
  const selectors = isMobile
    ? ['.wordmark', '.top nav .navbtn', '.search-toggle']
    : ['.wordmark', '.top nav .navbtn[aria-current="page"]', '.top nav .navbtn:not([aria-current])'];
  const results: Array<{ selector: string; ratio: number; gas: number }> = [];
  for (const selector of selectors) {
    // The brightest gas on screen, found with the header hidden, slid behind this item's words.
    const gas = await panBrightestGasUnder(page, selector);
    // A zero pan every 150 ms counts as the visitor's hand on the map, which keeps the idle recentring away while
    // the screenshot is taken with much of the cloud off screen.
    await page.evaluate(() => {
      (window as unknown as { __hold: number }).__hold = window.setInterval(() => window.__rmr!.map!.panBy(0, 0), 150);
    });
    const [r] = await contrastOverBackdrop(page, 'header.top', [selector]);
    await page.evaluate(() => window.clearInterval((window as unknown as { __hold: number }).__hold));
    results.push({ ...r, gas });
  }
  console.log(`header over the brightest gas: ${results.map((r) => `${r.selector} ${r.ratio.toFixed(2)} (gas ${r.gas.toFixed(2)})`).join(', ')}`);
  for (const r of results) {
    // Cream gas, not sky: otherwise this measures nothing.
    expect(r.gas, `mean luminance of the gas moved under ${r.selector}`).toBeGreaterThan(0.4);
    expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
  }
});

/** Mean luminance of what the map paints behind `selector`'s words right now, with `hide` out of the picture. */
async function gasBehind(page: Page, selector: string, hide: string): Promise<number> {
  const style = await page.addStyleTag({ content: `${hide} { visibility: hidden !important; }` });
  const png = (await page.screenshot()).toString('base64');
  await style.evaluate((el) => (el as Element).remove());
  return page.evaluate(
    async ([data, sel]) => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(sel)!);
      const t = range.getBoundingClientRect();
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      const d = ctx.getImageData(Math.floor(t.x * k), Math.floor(t.y * k), Math.max(1, Math.floor(t.width * k)), Math.max(1, Math.floor(t.height * k))).data;
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      return sum / (d.length / 4);
    },
    [png, selector] as const,
  );
}

test('on Home the header text keeps 4.5:1 over the brightest gas a moved map can put behind it', async ({ page, isMobile }) => {
  // Home's header is not glass, and Home keeps a camera the visitor moved: zoom into the map, go Home, and the
  // wordmark and the two links can sit over the cream gas.
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await act(page.getByRole('button', { name: COPY.map.zoomIn }), isMobile);
  await waitForCameraIdle(page);
  await act(page.locator('a.wordmark'), isMobile);
  await expect(page.locator('.map-pane')).toHaveAttribute('data-view', 'home');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  await twinkleOff(page);
  const HIDE = '.home, header.top';
  const selectors = ['.wordmark', '.top nav .navbtn[href="/map"]', '.top nav .navbtn[href="/about"]'];
  const results: Array<{ selector: string; ratio: number; gas: number }> = [];
  for (const selector of selectors) {
    // The brightest gas on screen (header and hero hidden to find it) slid behind this item's words.
    await panBrightestGasUnder(page, selector, HIDE);
    await page.evaluate(() => {
      (window as unknown as { __hold: number }).__hold = window.setInterval(() => window.__rmr!.map!.panBy(0, 0), 150);
    });
    // Measured after the pan: what is really behind the words now, not what the search expected to bring there.
    const gas = await gasBehind(page, selector, HIDE);
    const [r] = await contrastOverBackdrop(page, 'header.top', [selector]);
    await page.evaluate(() => window.clearInterval((window as unknown as { __hold: number }).__hold));
    results.push({ ...r, gas });
  }
  console.log(`Home header over the brightest gas: ${results.map((r) => `${r.selector} ${r.ratio.toFixed(2)} (gas ${r.gas.toFixed(2)})`).join(', ')}`);
  for (const r of results) {
    // Bright gas, not sky: otherwise this measures nothing.
    expect(r.gas, `mean luminance of the gas behind ${r.selector}`).toBeGreaterThan(0.4);
    // The rule is 4.5:1. The owner's ruling asks for more on Home: the text clearly apart from the gas behind it,
    // between the first scrim (5.96 for the two links here, 9.5 for the wordmark) and the glass bar of the other
    // pages (about 7.7 to 9.4 for the links on a GPU). So the weakest item, a link in the dust colour, holds 6.6.
    expect(r.ratio, r.selector).toBeGreaterThanOrEqual(6.6);
  }
  // Still a scrim, not a bar: nothing is blurred behind Home's header, and it has no background and no edge line.
  expect(await page.locator('header.top').evaluate((el) => {
    const [cs, b] = [getComputedStyle(el), getComputedStyle(el, '::before')];
    return { filter: cs.backdropFilter, bg: cs.backgroundColor, edge: cs.borderBottomColor, scrimFilter: b.backdropFilter, scrimBlur: b.filter, scrimOpacity: b.opacity };
  })).toEqual({ filter: 'none', bg: 'rgba(0, 0, 0, 0)', edge: 'rgba(0, 0, 0, 0)', scrimFilter: 'none', scrimBlur: 'none', scrimOpacity: '1' });
});

/** RGB of the screenshot pixel that holds each client point. `hide` is made fully see-through for the picture
 * (opacity, not visibility: a hidden control would lose the keyboard focus). */
async function rgbAt(page: Page, points: { x: number; y: number }[], hide?: string): Promise<number[][]> {
  const style = hide ? await page.addStyleTag({ content: `${hide} { opacity: 0 !important; transition: none !important; }` }) : null;
  const png = (await page.screenshot()).toString('base64');
  await style?.evaluate((el) => (el as Element).remove());
  return page.evaluate(
    async ([data, list]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const k = img.width / innerWidth;
      return list.map((q) => [...ctx.getImageData(Math.floor(q.x * k), Math.floor(q.y * k), 1, 1).data.slice(0, 3)]);
    },
    [png, points] as const,
  );
}
const linear = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
/** WCAG relative luminance of an 8-bit rgb. */
const lumOf = ([r, g, b]: number[]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
/** WCAG contrast of a lighter mark against a darker ground: below 1 when the "mark" is in fact the darker one. */
const over = (mark: number[], ground: number[]) => (lumOf(mark) + 0.05) / (lumOf(ground) + 0.05);
/** How far a pixel is from the lamp token, rgb(241, 236, 228): the largest channel difference. */
const offLamp = ([r, g, b]: number[]) => Math.max(Math.abs(r - 241), Math.abs(g - 236), Math.abs(b - 228));
/** Bright gas, not sky, as relative luminance: the same line the header and hint tests draw. */
const BRIGHT_GAS = 0.4;

/** The album with the brightest gas round it, among those on the canvas and clear of where the card opens (bottom
 * left, 400 px wide). The measure is the darkest of the points `radii` px out on four sides, so a neighbouring star
 * does not count as gas. */
async function brightestGasAlbum(page: Page, radii: number[]): Promise<{ id: number; gas: number }> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ([data, rs]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      const k = img.width / innerWidth;
      const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      const lum = (x: number, y: number) => {
        const i = (Math.floor(y * k) * img.width + Math.floor(x * k)) * 4;
        return 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
      };
      const api = window.__rmr!.map!;
      const n: number = (await (await fetch('/data/albums.json')).json()).length;
      const [w, h] = [innerWidth, innerHeight];
      let best = { id: -1, gas: -1 };
      for (let id = 0; id < n; id++) {
        const p = api.screenPoint(id);
        if (!p || p.x < 40 || p.x > w - 40 || p.y < 110 || p.y > h - 40) continue;
        if (p.x < 460 && p.y > h - 260) continue;
        if (!document.elementFromPoint(p.x, p.y)?.classList.contains('map-canvas')) continue;
        let gas = 1;
        for (const r of rs) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) gas = Math.min(gas, lum(p.x + dx * r, p.y + dy * r));
        if (gas > best.gas) best = { id, gas };
      }
      return best;
    },
    [png, radii] as const,
  );
}

test('the selected ring reads on the brightest gas', async ({ page, isMobile }) => {
  test.skip(isMobile, 'measured where the map has room; the ring is one CSS rule at every width');
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  await twinkleOff(page);
  const pick = await brightestGasAlbum(page, [8, 10]);
  expect(pick.gas, 'an album stands on bright gas at the opening view').toBeGreaterThan(BRIGHT_GAS);
  // Selected without a fly: while albums are dots a pick is marked by the DOM ring.
  await page.evaluate((i) => window.__rmr!.getState().setSelected(i), pick.id);
  const ring = page.locator('.map-sel');
  await expect(ring).toHaveCSS('opacity', '1');
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  const box = (await ring.boundingBox())!;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const r = box.width / 2;
  // The casing is a shadow: the ring's box is still the square OverlayDriver sets, centred on the album.
  const at = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), pick.id))!;
  expect(Math.hypot(c.x - at.x, c.y - at.y), 'the ring is centred on the album').toBeLessThan(0.51);
  expect(box.width).toBeCloseTo(box.height, 3);
  expect(box.width, 'the ring keeps its size (18 px or the dot plus 8)').toBeLessThan(21);
  // The middle of the 2 px ring (1 px inside its outer edge) and of the 2 px casing outside it, on four sides. A
  // band 2 px wide always holds the whole pixel under its middle line, so neither sample is a blend.
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const samples = sides.flatMap(([dx, dy]) => [
    { x: c.x + dx * (r - 1), y: c.y + dy * (r - 1) },
    { x: c.x + dx * (r + 1), y: c.y + dy * (r + 1) },
  ]);
  const rgb = await rgbAt(page, samples);
  // The same points with the ring out of the picture: the gas the casing lies on.
  const bare = await rgbAt(page, samples, '.map-sel');
  const rows = sides.map((_, i) => ({ ring: rgb[2 * i], casing: rgb[2 * i + 1], gas: bare[2 * i + 1] }));
  console.log(`selected ring on gas of luminance ${pick.gas.toFixed(2)}: ${rows.map((q) => `ring/casing ${over(q.ring, q.casing).toFixed(2)} gas/casing ${over(q.gas, q.casing).toFixed(2)} (gas ${lumOf(q.gas).toFixed(2)})`).join(', ')}`);
  rows.forEach((q, i) => {
    expect(lumOf(q.gas), `bright gas under the casing, side ${i}`).toBeGreaterThan(BRIGHT_GAS);
    expect(offLamp(q.ring), `ring colour, side ${i}`).toBeLessThanOrEqual(12);
    expect(over(q.ring, q.casing), `the ring against its casing, side ${i}`).toBeGreaterThanOrEqual(3);
    expect(over(q.gas, q.casing), `the gas against the casing, side ${i}`).toBeGreaterThanOrEqual(3);
  });
});

test('the keyboard focus ring of the controls that stand on the map reads on the brightest gas', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard focus; the casing is one CSS rule at every width');
  await page.addInitScript(() => {
    window.__rmrGasLite = 'off';
  });
  const hold = () =>
    page.evaluate(() => {
      (window as unknown as { __hold: number }).__hold = window.setInterval(() => window.__rmr!.map!.panBy(0, 0), 150);
    });
  const release = () => page.evaluate(() => window.clearInterval((window as unknown as { __hold: number }).__hold));
  /** Slides the brightest gas under `selector` (or, with `white`, puts white in place of the map), focuses it by
   * keyboard (so :focus-visible holds) and reads its ring. */
  const measure = async (selector: string, white = false) => {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    if (white) await page.addStyleTag({ content: '.map-host { visibility: hidden !important; } .map-pane { background: #fff !important; }' });
    else await panBrightestGasUnder(page, selector);
    // A zero pan every 150 ms counts as the visitor's hand on the map and keeps the idle recentring away.
    await hold();
    const before = (await control.boundingBox())!;
    await tabTo(page, (el, sel) => el.matches(sel), 80, selector);
    await expect(control).toBeFocused();
    await waitForAnimations(page);
    const box = (await control.boundingBox())!;
    expect(box, `${selector}: the casing rule does not move or resize the focused control`).toEqual(before);
    // Left and right of the control, at its mid height: the ring is the band 3 to 5 px out, its casing shows in
    // the band 5 to 7 px out. Each sample is on the middle line of its 2 px band, so neither is a blend.
    const y = box.y + box.height / 2;
    const samples = [
      { x: box.x - 4, y },
      { x: box.x - 6, y },
      { x: box.x + box.width + 4, y },
      { x: box.x + box.width + 6, y },
    ];
    const rgb = await rgbAt(page, samples);
    // The same points with the controls and the header out of the picture: the gas the casing lies on.
    const bare = await rgbAt(page, samples, '.map-ui, header.top');
    await expect(control).toBeFocused();
    await release();
    return [0, 2].map((i) => ({ selector, side: i ? 'right' : 'left', ring: rgb[i], casing: rgb[i + 1], gas: bare[i + 1] }));
  };
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  await twinkleOff(page);
  const rows = [...(await measure(`.map-zoom button[aria-label="${COPY.map.zoomIn}"]`))];
  // "Explore this area" stands on the map beside an open album. There the gas has stepped back (covers show), so
  // the brightest gas on screen is no test: the worst backdrop there is, white in place of the map, is.
  await page.goto('/album/in-rainbows-radiohead');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page);
  await twinkleOff(page);
  rows.push(...(await measure('.map-explore', true)));
  console.log(`focus rings over the brightest gas (white for .map-explore): ${rows.map((q) => `${q.selector} ${q.side} ring/casing ${over(q.ring, q.casing).toFixed(2)} gas/casing ${over(q.gas, q.casing).toFixed(2)} (gas ${lumOf(q.gas).toFixed(2)})`).join(', ')}`);
  for (const q of rows) {
    const name = `${q.selector}, ${q.side}`;
    expect(lumOf(q.gas), `bright gas (or white) under the casing of ${name}`).toBeGreaterThan(BRIGHT_GAS);
    expect(offLamp(q.ring), `ring colour of ${name}`).toBeLessThanOrEqual(12);
    expect(over(q.ring, q.casing), `the focus ring against its casing, ${name}`).toBeGreaterThanOrEqual(3);
    expect(over(q.gas, q.casing), `the gas against the casing, ${name}`).toBeGreaterThanOrEqual(3);
  }
});

test('the hover ring on a dot reads on the brightest gas', async ({ browser, baseURL, isMobile }) => {
  test.skip(isMobile, 'hover is a pointer state; the ring is drawn by the same shader at every width');
  // Two device pixels to the CSS pixel: the ring's 1.5 px stroke is then 3 device px, and the casing 1.25 px either
  // side of it 2.5, so each can be read from a pixel that lies wholly inside it.
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      window.__rmrGasLite = 'off';
    });
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    await waitForGasSharpSettled(page);
    await twinkleOff(page);
    const pick = await brightestGasAlbum(page, [7, 8.5]);
    expect(pick.gas, 'an album stands on bright gas at the opening view').toBeGreaterThan(BRIGHT_GAS);
    const p = (await page.evaluate((i) => window.__rmr!.map!.screenPoint(i), pick.id))!;
    // The shader's hover mark round a dot (shaders/album.ts): a 1.5 px off-white stroke of radius 7 on a dark band 4
    // px wide. Read on four sides: the stroke on its middle line, the casing 1.5 px outside and inside that line.
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const samples = sides.flatMap(([dx, dy]) => [5.5, 7, 8.5].map((r) => ({ x: p.x + dx * r, y: p.y + dy * r })));
    // The same points before the pointer comes: the gas (and the star's own glow) the mark is drawn on.
    const bare = await rgbAt(page, samples);
    await page.mouse.move(p.x, p.y);
    await expect(page.locator('.map-tip')).toHaveCSS('opacity', '1');
    await waitForCameraIdle(page);
    // The label is not what is measured: out of the picture, should it lie over a sample.
    const rgb = await rgbAt(page, samples, '.map-tip');
    const rows = sides.map((_, i) => ({ inner: rgb[3 * i], stroke: rgb[3 * i + 1], outer: rgb[3 * i + 2], gas: bare[3 * i + 2] }));
    console.log(`hover ring on gas of luminance ${pick.gas.toFixed(2)}: ${rows.map((q) => `stroke/casing ${over(q.stroke, q.outer).toFixed(2)} out ${over(q.stroke, q.inner).toFixed(2)} in, gas/casing ${over(q.gas, q.outer).toFixed(2)} (gas ${lumOf(q.gas).toFixed(2)})`).join(', ')}`);
    rows.forEach((q, i) => {
      expect(lumOf(q.gas), `bright gas under the casing, side ${i}`).toBeGreaterThan(BRIGHT_GAS);
      expect(over(q.stroke, q.outer), `the stroke against its casing outside, side ${i}`).toBeGreaterThanOrEqual(3);
      expect(over(q.stroke, q.inner), `the stroke against its casing inside, side ${i}`).toBeGreaterThanOrEqual(3);
      expect(over(q.gas, q.outer), `the gas against the casing, side ${i}`).toBeGreaterThanOrEqual(3);
    });
  } finally {
    await context.close();
  }
});
