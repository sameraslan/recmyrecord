import { expect, test, type Page } from '@playwright/test';
import { COPY } from '../src/lib/copy';
import { act, mapFrames, visibleAlbumPoint, waitForCameraIdle, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

/** The names toggle (part 2 Task 6): the owner's option B, a detached box 8 px above the zoom stack. The map's
 * own chunk puts it in as the first child of .map-zoom (overlays/NamesToggle.tsx). */
const IR = '/album/in-rainbows-radiohead';
const toggle = (page: Page) => page.getByRole('button', { name: COPY.map.names, exact: true });
const zoomIn = (page: Page) => page.getByRole('button', { name: COPY.map.zoomIn, exact: true });

type Box = { x: number; y: number; width: number; height: number };
const boxOf = async (page: Page, selector: string): Promise<Box> => (await page.locator(selector).boundingBox())!;

/** Page errors and console errors (hydration errors arrive as either); remote cover failures excepted. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const remoteCover = m.text().startsWith('Failed to load resource') && /^https:\/\/i\.scdn\.co\//.test(m.location().url);
    if (!remoteCover) errors.push(m.text());
  });
  return errors;
}

async function openMap(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForCameraIdle(page);
}

test('the names toggle is its own box 8 px above the zoom stack, the size and glass of a zoom button', async ({ page, isMobile }) => {
  await openMap(page);
  await expect(toggle(page)).toBeVisible();
  // The first child of the zoom corner, before the three zoom buttons.
  expect(await page.locator('.map-zoom').evaluate((el) => [...el.children].map((c) => `${c.tagName}:${c.getAttribute('aria-label')}`))).toEqual(
    [COPY.map.names, COPY.map.zoomIn, COPY.map.zoomOut, COPY.map.reset].map((l) => `BUTTON:${l}`),
  );
  const side = isMobile ? 44 : 40;
  const t = (await toggle(page).boundingBox())!;
  const z = (await zoomIn(page).boundingBox())!;
  expect([t.width, t.height]).toEqual([side, side]);
  expect([z.width, z.height]).toEqual([side, side]);
  expect(t.x).toBe(z.x);
  expect(z.y - (t.y + t.height)).toBe(8);
  // A full border of its own, and Zoom in has its top border back; the buttons under it still share theirs.
  const look = (label: string) =>
    page.getByRole('button', { name: label, exact: true }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: s.borderTopWidth, bottom: s.borderBottomWidth, left: s.borderLeftWidth, border: s.borderTopColor, bg: s.backgroundColor, ink: s.color, filter: s.backdropFilter };
    });
  const names = await look(COPY.map.names);
  const plus = await look(COPY.map.zoomIn);
  expect(names).toEqual(plus);
  expect([names.top, names.bottom, names.left]).toEqual(['1px', '1px', '1px']);
  expect((await look(COPY.map.zoomOut)).top).toBe('0px');
  // The glyph: 16 px like the zoom icons, drawn at stroke 1.6.
  const icon = (await toggle(page).locator('svg').boundingBox())!;
  expect([icon.width, icon.height]).toEqual([16, 16]);
  expect(await toggle(page).locator('svg').evaluate((el) => getComputedStyle(el).strokeWidth)).toBe('1.6px');
  expect(await toggle(page).locator('svg').getAttribute('aria-hidden')).toBe('true');
  // Inside the map and clear of the page header.
  const pane = await boxOf(page, '.map-pane');
  expect(t.y).toBeGreaterThan(pane.y);
  expect(t.x + t.width).toBeLessThanOrEqual(pane.x + pane.width);
});

test('a press switches it off and on: one fixed label, a pressed state, a masked slash, and the choice saved', async ({ page, isMobile }) => {
  await openMap(page);
  const button = toggle(page);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => [window.__rmr!.getState().namesOn, localStorage.getItem('rmr-names')])).toEqual([true, null]);
  await expect(button.locator('mask')).toHaveCount(0);
  await act(button, isMobile);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toHaveAttribute('aria-label', COPY.map.names);
  expect(await page.evaluate(() => [window.__rmr!.getState().namesOn, localStorage.getItem('rmr-names')])).toEqual([false, '0']);
  // Off: the same letters at 42%, behind a mask, and a thin slash.
  await expect(button.locator('mask')).toHaveCount(1);
  expect(await button.locator('svg > g').evaluate((el) => [getComputedStyle(el).opacity, el.getAttribute('mask')])).toEqual(['0.42', 'url(#rmr-names-cut)']);
  expect(await button.locator('svg > path').evaluate((el) => [getComputedStyle(el).strokeWidth, getComputedStyle(el).opacity])).toEqual(['1.2px', '0.95']);
  const size = (await button.boundingBox())!;
  expect([size.width, size.height]).toEqual(isMobile ? [44, 44] : [40, 40]);
  await act(button, isMobile);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveAttribute('aria-label', COPY.map.names);
  await expect(button.locator('mask')).toHaveCount(0);
  expect(await page.evaluate(() => [window.__rmr!.getState().namesOn, localStorage.getItem('rmr-names')])).toEqual([true, '1']);
});

test('a reload with names off comes back off, with no hydration or page error; only an exact 0 means off', async ({ page }) => {
  const errors = watchErrors(page);
  await openMap(page);
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  for (const path of ['/map', IR, '/']) {
    await page.goto(path);
    await waitForMap(page);
    expect(await page.evaluate(() => window.__rmr!.getState().namesOn), path).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('rmr-names')), path).toBe('0');
  }
  await page.goto('/map');
  await waitForMap(page);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle(page).locator('mask')).toHaveCount(1);
  for (const junk of ['false', '00', '']) {
    await page.evaluate((v) => localStorage.setItem('rmr-names', v), junk);
    await page.reload();
    await waitForMap(page);
    await expect(toggle(page), junk).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.__rmr!.getState().namesOn), junk).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('keyboard: it is the one Tab stop before Zoom in on every map view', async ({ page, isMobile }) => {
  const check = async (view: string) => {
    await expect(toggle(page), view).toBeVisible();
    // Reached with Tab from the stop before the corner: "Explore this area" beside an album, else the slider's
    // last stop.
    const explore = page.getByRole('button', { name: COPY.map.exploreHere, exact: true });
    const before = (await explore.count()) ? explore : page.locator('.mode-stops button').last();
    await before.focus();
    await expect(before, view).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(toggle(page), view).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(zoomIn(page), view).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(toggle(page), view).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle), view).toBe('solid');
    // Space and Enter press it, and it keeps the focus (the same button, redrawn).
    await page.keyboard.press('Enter');
    await expect(toggle(page), view).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle(page), view).toBeFocused();
    await page.keyboard.press('Space');
    await expect(toggle(page), view).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle(page), view).toBeFocused();
  };
  await openMap(page);
  await check('the map');
  // Beside an open album (a phone shows the map, and so the corner, in map mode only).
  await page.goto(IR);
  await waitForMap(page);
  if (isMobile) {
    await expect(toggle(page)).toHaveCount(0);
    await page.getByRole('button', { name: COPY.phone.mapLabel }).click();
  }
  await expect(page.locator('.mk')).toHaveCount(6);
  await check('beside an open album');
  if (isMobile) {
    await page.getByRole('button', { name: COPY.phone.listLabel }).click();
    await expect(toggle(page)).toHaveCount(0);
    return;
  }
  // With the Explore card open (desktop: the corner stays; phones hide it, see the test below).
  await openMap(page);
  const p = await visibleAlbumPoint(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('.card')).toBeVisible();
  await check('with the Explore card open');
});

test('it comes and goes with the zoom corner across views, one button each time, the choice kept', async ({ page, isMobile }) => {
  await openMap(page);
  await act(toggle(page), isMobile);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  // Home has no zoom corner; back on the map there is one toggle again, still off (no reload in between).
  await act(page.locator('header').getByRole('link', { name: COPY.wordmark, exact: true }), isMobile);
  await expect(page).toHaveURL('/');
  await expect(page.locator('.map-zoom, .map-names')).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL('/map');
  await expect(page.locator('.map-names')).toHaveCount(1);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.locator('.map-zoom').evaluate((el) => el.firstElementChild!.className)).toBe('map-names');
  await act(toggle(page), isMobile);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('client-side moves between map views never lose or double it: one button, first in the corner, the choice kept', async ({ page, isMobile }) => {
  await openMap(page);
  await act(toggle(page), isMobile);
  /** Exactly one toggle, the first child of the one zoom corner, still off and drawn off. */
  const one = async (step: string) => {
    await expect(page.locator('.map-names'), step).toHaveCount(1);
    await expect(page.locator('.map-zoom'), step).toHaveCount(1);
    expect(await page.locator('.map-zoom').evaluate((el) => [...el.children].map((c) => c.getAttribute('aria-label'))), step).toEqual([COPY.map.names, COPY.map.zoomIn, COPY.map.zoomOut, COPY.map.reset]);
    await expect(toggle(page), step).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle(page).locator('mask'), step).toHaveCount(1);
  };
  await one('the map');
  // No page.goto from here on: every step is a client-side route or state change, so the same React tree stays
  // mounted and the corner is remounted (or kept) by React, which is what could lose the button.
  const loads = await page.evaluate(() => ((window as unknown as { __sameDocument: boolean }).__sameDocument = true));
  expect(loads).toBe(true);
  const p = await visibleAlbumPoint(page);
  await page.evaluate((id) => window.__rmr!.getState().setSelected(id), p.id);
  await expect(page.locator('.card')).toBeVisible();
  if (!isMobile) await one('with the Explore card');
  await act(page.locator('.card').getByRole('link', { name: COPY.map.cardPrimary }), isMobile);
  await expect(page).toHaveURL(/\/album\//);
  const mapButton = page.getByRole('button', { name: COPY.phone.mapLabel });
  const listButton = page.getByRole('button', { name: COPY.phone.listLabel });
  if (isMobile) {
    // The phone album list has no zoom corner; Map and List, twice.
    for (const round of ['first', 'second']) {
      await expect(page.locator('.map-zoom, .map-names'), round).toHaveCount(0);
      await act(mapButton, true);
      await expect(page.locator('section.album'), round).toBeHidden();
      await one(`map mode, ${round} time`);
      if (round === 'first') await act(listButton, true);
    }
  } else {
    await expect(page.locator('.mk')).toHaveCount(6);
    await one('beside the album');
    // Album to album by a pick on the map: the corner stays mounted.
    await waitForCameraIdle(page);
    const from = page.url();
    const mk = (await page.locator('.mk:not(.mk--seed)').first().boundingBox())!;
    await page.mouse.click(mk.x + mk.width / 2, mk.y + mk.height / 2);
    await expect(page).not.toHaveURL(from);
    await expect(page).toHaveURL(/\/album\//);
    await one('beside the next album');
  }
  await act(page.getByRole('button', { name: COPY.map.exploreHere, exact: true }), isMobile);
  await expect(page).toHaveURL('/map');
  await one('back on the map with "Explore this area"');
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  // And it still works: the same single button switches the names back on.
  await act(toggle(page), isMobile);
  await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => [window.__rmr!.getState().namesOn, localStorage.getItem('rmr-names')])).toEqual([true, '1']);
});

test('the corner does not move when the toggle arrives: its place is kept free above Zoom in', async ({ page }) => {
  // Hold back the map's own chunk (it carries the toggle) while the zoom corner is already drawn.
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  let held = 0;
  await page.route('**/_next/static/chunks/**/*.js', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes('rmr-names-cut')) {
      held++;
      await gate;
    }
    await route.fulfill({ response, body });
  });
  await page.goto('/map');
  await expect(zoomIn(page)).toBeVisible();
  await expect.poll(() => held).toBe(1);
  await expect(page.locator('.map-names')).toHaveCount(0);
  const measure = () =>
    page.evaluate((labels) => {
      const r = (el: Element) => {
        const b = el.getBoundingClientRect();
        return [b.left, b.top, b.width, b.height];
      };
      return { corner: r(document.querySelector('.map-zoom')!), buttons: labels.map((l) => r(document.querySelector(`.map-zoom [aria-label="${l}"]`)!)) };
    }, [COPY.map.zoomIn, COPY.map.zoomOut, COPY.map.reset]);
  const before = await measure();
  // The corner already has its full height: a button and 8 px above the three zoom buttons.
  const side = before.buttons[0][3];
  expect(before.corner[3]).toBe(4 * side + 8);
  expect(before.buttons[0][1] - before.corner[1]).toBe(side + 8);
  release();
  await expect(toggle(page)).toBeVisible();
  expect(await measure()).toEqual(before);
  const t = (await toggle(page).boundingBox())!;
  expect([t.x, t.y, t.width, t.height]).toEqual([before.corner[0], before.corner[1], side, side]);
});

test('on a phone it lifts with the zoom stack above the slider panel and hides with it under the Explore card', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await openMap(page);
  const panelTop = (await boxOf(page, '.mode')).y;
  const corner = await boxOf(page, '.map-zoom');
  const t = (await toggle(page).boundingBox())!;
  expect(corner.height).toBe(4 * 44 + 8);
  expect(panelTop - (corner.y + corner.height)).toBeCloseTo(8, 0);
  expect(t.y).toBe(corner.y);
  // Clear of the page header and of the map's top edge.
  expect(t.y).toBeGreaterThan((await boxOf(page, '.map-pane')).y + 44);
  const p = await visibleAlbumPoint(page);
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.locator('.card')).toBeVisible();
  await expect(toggle(page)).toBeHidden();
  await expect(zoomIn(page)).toBeHidden();
  await act(page.locator('.card .x'), true);
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(toggle(page)).toBeVisible();
  expect((await toggle(page).boundingBox())!.y).toBe(t.y);
});

test('toggling leaves the map at rest, and moving the pointer over the map touches nothing in the corner', async ({ page, isMobile }) => {
  await page.goto(isMobile ? '/map' : IR);
  await waitForMap(page);
  await waitForCameraIdle(page);
  await waitForGasSharpSettled(page);
  // A press draws no canvas frame: nothing on the canvas depends on the toggle yet. The names layer (part 2
  // Task 7) sets this to the value it measures, with the reason in its report; it is not to be widened ahead.
  const f0 = await mapFrames(page);
  await act(toggle(page), isMobile);
  await act(toggle(page), isMobile);
  await page.waitForTimeout(400);
  const f1 = await mapFrames(page);
  expect(f1 - f0).toBe(0);
  await page.waitForTimeout(600);
  expect(await mapFrames(page)).toBe(f1);
  if (isMobile) return;
  // Beside an open album every album crossed re-renders the map (the hover). The toggle is not part of that.
  await page.evaluate(() => {
    const w = window as unknown as { __cornerChanges: number; __hot: number };
    w.__cornerChanges = 0;
    w.__hot = 0;
    new MutationObserver((r) => (w.__cornerChanges += r.length)).observe(document.querySelector('.map-zoom')!, { subtree: true, childList: true, attributes: true, characterData: true });
    let last = window.__rmr!.getState().hot;
    window.__rmr!.subscribe((s) => {
      if (s.hot !== last) w.__hot++;
      last = s.hot;
    });
  });
  const boxes = await page.locator('.mk').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })));
  for (const b of boxes) await page.mouse.move(b.x, b.y, { steps: 6 });
  await waitForMapQuiet(page);
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __cornerChanges: number; __hot: number };
    return { changes: w.__cornerChanges, hot: w.__hot };
  });
  expect(seen.hot, 'the pointer did cross albums').toBeGreaterThan(1);
  expect(seen.changes).toBe(0);
});
