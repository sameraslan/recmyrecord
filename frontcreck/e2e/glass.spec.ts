import { expect, test, type Page } from '@playwright/test';
import { contrastOverBackdrop, mapFrames, panBrightestGasUnder, waitForAnimations, waitForCameraIdle, waitForGasSharpSettled, waitForMap } from './helpers';

const GLASS = 'blur(22px) saturate(1.2) brightness(0.58)';
/** Solid is fully solid; the browser reports rgba(10, 9, 14, 1) as rgb(10, 9, 14). */
const SOLID = 'rgb(10, 9, 14)';
/** The album whose accent has the lowest contrast in the catalog (#d44f4f). */
const WEAKEST = '/album/making-movies-dire-straits';

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
  // The Home search field, when it does not hold the focus (on desktop it takes it on load; focused it is opaque).
  await page.locator('.combo--hero input').evaluate((el) => (el as HTMLElement).blur());
  // Polled: the field's background eases over .2 s (search.css .combo-field).
  await expect.poll(() => styleOf(page, '.combo--hero .combo-field')).toEqual(isMobile ? { filter: 'none', bg: SOLID } : { filter: GLASS, bg: 'rgba(10, 9, 14, 0.66)' });
  await page.goto('/about');
  expect(await styleOf(page, '.about')).toEqual(isMobile ? { filter: 'none', bg: SOLID } : { filter: GLASS, bg: 'rgba(8, 7, 11, 0.7)' });
});

test('the focused Home search field is opaque, as every focused search field', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a phone does not focus the field on load');
  await page.goto('/');
  await expect(page.locator('.combo--hero input')).toBeFocused();
  // room-3, the focus background of .combo-field (search.css).
  await expect.poll(async () => (await styleOf(page, '.combo--hero .combo-field')).bg).toBe('rgb(23, 22, 29)');
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
  });
  // TODO(part2-task8): twinkleOff(page)
  await page.goto(WEAKEST);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  await waitForGasSharpSettled(page); // measure the image that stays
  const results = await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.seed-title', '.tags li', '.recs-h', '.rec-n', '.rec-title', '.rec-artist', '.rec-shared']);
  // TODO(part2-task8): twinkleOff(page)
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
    // Beside an album on a narrow desktop window the hint wraps, and its first line starts higher in the band.
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto('/album/in-rainbows-radiohead');
    await waitForMap(page);
    await waitForCameraIdle(page);
    await waitForAnimations(page);
    const hint = page.locator('.map-hint');
    await expect(hint).toBeVisible();
    const lines = await hint.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight);
    });
    expect(lines, 'the hint wraps at this width').toBeGreaterThan(1.5);
    // The worst backdrop there is: white in place of the map.
    await page.addStyleTag({ content: '.map-host { visibility: hidden !important; } .map-pane { background: #fff !important; }' });
    const [r] = await contrastOverBackdrop(page, '.map-ui', ['.map-hint'], { box: 'text' });
    console.log(`wrapped hint over white: ${r.ratio.toFixed(2)}`);
    expect(r.ratio).toBeGreaterThanOrEqual(4.5);
  });
});
