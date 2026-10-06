import { expect, test, type Page } from '@playwright/test';
import { contrastOverBackdrop, mapFrames, waitForAnimations, waitForCameraIdle, waitForGasSharpSettled, waitForMap } from './helpers';

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
  const results = await contrastOverBackdrop(page, 'section.album', ['.seed-artist', '.seed-title', '.tags li', '.recs-h', '.rec-n', '.rec-title', '.rec-artist', '.rec-shared']);
  // TODO(part2-task8): twinkleOff(page)
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  // The hint is desktop only (display: none under 900 px).
  results.push(...(await contrastOverBackdrop(page, '.map-ui', ['.mode .cap', '.mode-stops button', '.mode-note', ...(isMobile ? [] : ['.map-hint'])])));
  console.log(`glass contrast: ${results.map((r) => `${r.selector} ${r.ratio.toFixed(2)}`).join(', ')}`);
  for (const r of results) expect(r.ratio, r.selector).toBeGreaterThanOrEqual(4.5);
});

test('glass over the map costs no frame at rest', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no glass');
  // A backdrop blur over the canvas must not make the map draw: the canvas stays still and the browser only
  // composites. Checked on the map alone and beside an open album (the widest glass surface).
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
