import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { shot, visibleAlbumPoint, waitForAnimations, waitForCameraIdle, waitForMap } from './helpers';

const IR = '/album/in-rainbows-radiohead';

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('phone album', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('list first, then the map strip; the Map button toggles a full-screen map', async ({ page }, info) => {
    await page.goto(IR);
    await expect(page.locator('section.album .seed .cover')).toHaveCSS('width', '92px');
    await expect(page.locator('.album-close')).toBeHidden();
    const strip = page.getByRole('img', { name: COPY.map.preview });
    await strip.scrollIntoViewIfNeeded();
    await expect(strip).toBeVisible();
    const lastRow = await page.locator('li.rec').last().boundingBox();
    const stripBox = await strip.boundingBox();
    expect(stripBox!.y).toBeGreaterThan(lastRow!.y);
    await shot(page, info, 'album-list');
    await waitForMap(page);
    const fab = page.getByRole('button', { name: COPY.phone.mapLabel });
    await expect(fab).toBeVisible();
    await expect(page.locator('.mode')).toBeHidden();
    await fab.tap();
    await expect(page.locator('section.album')).toBeHidden();
    const list = page.getByRole('button', { name: COPY.phone.listLabel });
    await expect(list).toBeVisible();
    await expect(list).toBeFocused();
    await expect(page.locator('.mk')).toHaveCount(6);
    await expect(page.locator('.mode')).toBeVisible();
    const mode = await page.locator('.mode').boundingBox();
    expect(mode!.y + mode!.height).toBeGreaterThan(page.viewportSize()!.height - 40);
    await waitForCameraIdle(page);
    await shot(page, info, 'album-mapmode');
    await list.tap();
    await expect(page.locator('section.album')).toBeVisible();
    await strip.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: COPY.map.openMap }).tap();
    await expect(page.locator('section.album')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('section.album')).toBeVisible();
    await expect(page).toHaveURL(IR);
  });

  test('an album entered from Home still slides away for the map', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('list', { name: COPY.home.shelfListLabel }).locator('a').first().tap();
    await expect(page.locator('section.album')).toHaveClass(/is-entering/);
    await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
    await expect(page.locator('section.album')).toBeHidden();
    await expect.poll(() => page.locator('section.album').evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  });

  test('a map pick in map mode opens that album as a list, focused, with a fade', async ({ page }) => {
    await page.goto(IR);
    await waitForMap(page);
    await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
    await expect(page.locator('section.album')).toBeHidden();
    await expect(page.locator('.mk')).toHaveCount(6);
    await waitForCameraIdle(page);
    // Markers take no pointer events: the tap reaches the canvas, which hit-tests their boxes.
    const box = (await page.locator('.mk:not(.mk--seed)').first().boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).not.toHaveURL(IR);
    await expect(page).toHaveURL(/\/album\//);
    const album = page.locator('section.album');
    // The panel must never slide in from the left: sample its position for 500 ms from the new URL on.
    const minLeft = await album.evaluate(
      (el) =>
        new Promise<number>((resolve) => {
          let min = el.getBoundingClientRect().left;
          const t0 = performance.now();
          const tick = () => {
            min = Math.min(min, document.querySelector('section.album')!.getBoundingClientRect().left);
            if (performance.now() - t0 < 500) requestAnimationFrame(tick);
            else resolve(min);
          };
          requestAnimationFrame(tick);
        }),
    );
    expect(minLeft).toBe(0);
    await expect(album).toBeVisible();
    await expect(album).not.toHaveClass(/album--hidden|is-entering/);
    await expect(album).not.toHaveAttribute('inert');
    await expect(page.locator('#seed-title')).toBeFocused();
    await expect(page.locator('.album-scroll > .fade-in')).toHaveCount(1);
    await expect(page.getByRole('button', { name: COPY.phone.mapLabel })).toBeVisible();
  });

  test('under reduced motion the Map and List buttons switch within a frame', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(IR);
    await waitForMap(page);
    const afterClick = (label: string) =>
      page.evaluate(
        (name) =>
          new Promise<{ right: number; left: number; visibility: string }>((resolve) => {
            document.querySelector<HTMLButtonElement>(`.fab-map[aria-label="${name}"]`)!.click();
            requestAnimationFrame(() => {
              const el = document.querySelector('section.album')!;
              const r = el.getBoundingClientRect();
              resolve({ right: r.right, left: r.left, visibility: getComputedStyle(el).visibility });
            });
          }),
        label,
      );
    const hidden = await afterClick(COPY.phone.mapLabel);
    expect(hidden.right).toBeLessThanOrEqual(0);
    expect(hidden.visibility).toBe('hidden');
    const shown = await afterClick(COPY.phone.listLabel);
    expect(shown.left).toBe(0);
    expect(shown.visibility).toBe('visible');
  });

  test('tap targets are at least 44 px', async ({ page }) => {
    for (const url of ['/', IR, '/map', '/about', '/nothing-here']) {
      await page.goto(url);
      await waitForAnimations(page);
      expect(await smallTargets(page), url).toEqual([]);
    }
    // Open states: the tapped Explore card, the search sheet and album map mode.
    await page.goto('/map');
    await waitForMap(page);
    await waitForCameraIdle(page);
    const p = await visibleAlbumPoint(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(page.locator('.card')).toBeVisible();
    expect(await smallTargets(page), 'Explore card').toEqual([]);
    await page.getByRole('button', { name: COPY.search.open, exact: true }).tap();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('combobox').pressSequentially('radiohead');
    await expect(page.getByRole('option').first()).toBeVisible();
    expect(await smallTargets(page), 'search sheet').toEqual([]);
    await page.goto(IR);
    await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
    await expect(page.getByRole('button', { name: COPY.phone.listLabel })).toBeVisible();
    await expect(page.locator('section.album')).toHaveCSS('visibility', 'hidden'); // the panel has slid out
    expect(await smallTargets(page), 'map mode').toEqual([]);
  });
});

/** Visible tap targets under 44 px high (or, for icon buttons, under 44 px wide). */
function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="range"]), [role="option"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      if (el.closest('.mosaic')) continue; // shelf covers are large squares
      if (r.height < 44 || (el.getAttribute('aria-label') && el.tagName === 'BUTTON' && r.width < 44)) out.push(`${el.tagName} ${el.className} ${el.textContent?.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

test('no horizontal scroll at 360 and 1600 px', async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 360, height: 740 } : { width: 1600, height: 900 });
  for (const url of ['/', '/map', IR, `${IR}?by=mood`, '/about', '/no-such-page']) {
    await page.goto(url);
    await waitForAnimations(page);
    await noHorizontalScroll(page);
  }
});

test.describe('motion', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop transitions');

  test('entering an album slides the panel in; album to album fades the content', async ({ page }, info) => {
    await page.goto('/map');
    await waitForMap(page);
    await page.getByRole('combobox', { name: COPY.search.label }).pressSequentially('in rainbows');
    await expect(page.getByRole('option').first()).toContainText('In Rainbows');
    await page.keyboard.press('Enter');
    await expect(page.locator('section.album')).toHaveClass(/is-entering/);
    await page.waitForTimeout(180); // a fixed point inside the slide, for the mid-transition screenshot
    await shot(page, info, 'transition-mid');
    await expect(page.locator('section.album')).not.toHaveCSS('transform', /matrix\(1, 0, 0, 1, -/, { timeout: 2000 });
    await page.locator('li.rec').first().locator('a.rec-main').click();
    await expect(page.locator('section.album')).not.toHaveClass(/is-entering/);
    await expect(page.locator('.album-scroll > .fade-in')).toHaveCount(1);
  });

  test('reduced motion makes the panel appear at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/map');
    await waitForMap(page);
    await page.getByRole('combobox', { name: COPY.search.label }).pressSequentially('in rainbows');
    await expect(page.getByRole('option').first()).toContainText('In Rainbows');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(IR);
    await page.waitForTimeout(40); // nothing should move: a slide would still be well off 0 here
    const x = await page.locator('section.album').evaluate((el) => el.getBoundingClientRect().left);
    expect(x).toBe(0);
    expect(await page.evaluate(() => window.__rmr!.map!.isAnimating())).toBe(false);
  });
});

test('the "Link copied" toast keeps clear of the bottom edge and of the Map button', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(IR);
  await expect(page.locator('li.rec')).toHaveCount(5);
  // The copy button is in the album list; the slider panel is not on screen here (it belongs to map mode).
  await expect(page.locator('.mode')).toHaveCount(0);
  await page.getByRole('button', { name: COPY.album.copyLinkLabel }).tap();
  const toast = page.getByRole('status').filter({ hasText: COPY.album.linkCopied });
  await expect(toast).toBeVisible();
  await waitForAnimations(page);
  const t = (await toast.boundingBox())!;
  const vp = page.viewportSize()!;
  // 28 px above the bottom edge plus the safe area inset (0 in this emulation; glass.test.ts pins the env() term).
  expect(vp.height - (t.y + t.height)).toBeGreaterThanOrEqual(27.5);
  const fab = (await page.getByRole('button', { name: COPY.phone.mapLabel }).boundingBox())!;
  const apart = t.x + t.width <= fab.x || fab.x + fab.width <= t.x || t.y + t.height <= fab.y || fab.y + fab.height <= t.y;
  expect(apart, 'the toast and the Map button do not overlap').toBe(true);
});

test('the zoom corner, with the names button, clears the slider below it and whatever is above it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  // The smallest phone the layout is checked on.
  await page.setViewportSize({ width: 360, height: 640 });
  /** The buttons of the bottom right corner (names, zoom in, zoom out, whole map), top to bottom. */
  const corner = () =>
    page.locator('.map-zoom button, button.map-names, .map-names button').evaluateAll((els) =>
      els
        .map((e) => ({ r: e.getBoundingClientRect(), names: e.classList.contains('map-names') }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        .map(({ r, names }) => ({ x: r.x, y: r.y, w: Math.round(r.width), h: Math.round(r.height), names }))
        .sort((a, b) => a.y - b.y),
    );
  const check = async (ceiling: number, label: string) => {
    // The names button arrives with the map's own chunk, after the three zoom buttons: wait for it before counting.
    await expect(page.locator('.map-zoom .map-names'), label).toBeVisible();
    const buttons = await corner();
    const mode = (await page.locator('.mode').boundingBox())!;
    for (const b of buttons) {
      expect(b.w, label).toBeGreaterThanOrEqual(44);
      expect(b.h, label).toBeGreaterThanOrEqual(44);
      // Wholly on the screen.
      expect(b.x, label).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, label).toBeLessThanOrEqual(360);
    }
    // No two overlap, the lowest ends 8 px above the slider panel (map.css: --slider-cover + 8px), the highest
    // starts at least 8 px under what is above it.
    for (let i = 1; i < buttons.length; i++) expect(buttons[i].y - (buttons[i - 1].y + buttons[i - 1].h), label).toBeGreaterThanOrEqual(-1);
    const last = buttons[buttons.length - 1];
    expect(mode.y - (last.y + last.h), label).toBeGreaterThanOrEqual(7);
    expect(buttons[0].y - ceiling, label).toBeGreaterThanOrEqual(8);
    // The names button is the top one, in its own box 8 px above the zoom stack.
    expect(buttons[0].names, label).toBe(true);
    expect(buttons[1].y - (buttons[0].y + buttons[0].h), label).toBeGreaterThanOrEqual(7);
    return buttons.length;
  };
  // Explore at the opening view: the names button and three zoom buttons, under the header.
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
  const header = (await page.locator('header.top').boundingBox())!;
  expect(await check(header.y + header.height, 'explore')).toBe(4);
  // An album's map mode: the corner must also clear the Explore and List buttons of the top row.
  await page.goto(IR);
  await waitForMap(page);
  await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
  await expect(page.locator('.mode')).toBeVisible();
  await waitForMap(page); // map mode starts the other two stops' gas (part 1): settled before anything is measured
  await waitForCameraIdle(page);
  await waitForAnimations(page);
  const list = (await page.locator('.fab-map--on').boundingBox())!;
  const explore = (await page.locator('.map-explore').boundingBox())!;
  expect(await check(Math.max(list.y + list.height, explore.y + explore.height), 'album map mode')).toBe(4);
});

test('the List button keeps its place and its layer under keyboard focus, with the dark casing round its ring', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  await page.goto(IR);
  await waitForMap(page);
  await page.getByRole('button', { name: COPY.phone.mapLabel }).tap();
  const list = page.locator('.fab-map--on');
  await expect(list).toBeVisible();
  await expect(page.locator('.mode')).toBeVisible();
  await waitForAnimations(page);
  const before = (await list.boundingBox())!;
  // The tap left the focus on the button without a ring. Away and back by keyboard, so :focus-visible holds.
  await page.keyboard.press('Shift+Tab');
  await expect(list).not.toBeFocused();
  await page.keyboard.press('Tab');
  await expect(list).toBeFocused();
  expect(await list.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
  await waitForAnimations(page);
  expect(await list.boundingBox(), 'the casing rule does not move or resize the List button').toEqual(before);
  // Still above the album panel and the map (phone.css .fab-map), which a z-index in the casing rule would undo.
  await expect(list).toHaveCSS('z-index', '12');
  // The band from the button's edge to 7 px out, under the 2 px ring that starts 3 px out.
  await expect(list).toHaveCSS('box-shadow', /^rgba\(4, 4, 8, 0\.8\) 0px 0px 0px 7px$/);
  await expect(list).toHaveCSS('outline-width', '2px');
  await expect(list).toHaveCSS('outline-offset', '3px');
});
