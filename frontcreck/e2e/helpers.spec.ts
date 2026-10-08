import { expect, test, type Page } from '@playwright/test';
import { mapFrames, waitForGasSharpSettled, waitForMap, waitForMapQuiet } from './helpers';

/** Tests of the e2e helpers themselves: a wait that passes on a stale view lets every test that uses it read the
 * previous view. */

/** Opens /map and waits until the map has drawn and is quiet, so a move after this starts from rest. */
async function mapAtRest(page: Page): Promise<void> {
  await page.goto('/map');
  await waitForMap(page);
  await waitForMapQuiet(page, 300);
}

/** Holds back the page's next animation frame tick by `ms`: every requestAnimationFrame callback asked for in that
 * tick runs together, in order, `ms` later, as on a slow renderer whose next frame is late. Later ticks are not
 * held. */
async function holdNextTick(page: Page, ms: number): Promise<void> {
  await page.evaluate((delay) => {
    const raf = window.requestAnimationFrame.bind(window);
    let held: FrameRequestCallback[] | null = null;
    window.requestAnimationFrame = (cb) => {
      if (!held) {
        held = [];
        setTimeout(() => {
          window.requestAnimationFrame = raf;
          raf((t) => held!.forEach((c) => c(t)));
        }, delay);
      }
      held.push(cb);
      return 0;
    };
  }, ms);
}

/** Holds back only the next requestAnimationFrame callback (the map's, asked for by the camera move) by `ms`, while
 * every other callback runs on time: a frame that is late for a reason no barrier frame can see. */
async function holdNextCallback(page: Page, ms: number): Promise<void> {
  await page.evaluate((delay) => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      window.requestAnimationFrame = raf;
      setTimeout(() => raf(cb), delay);
      return 0;
    };
  }, ms);
}

/** Moves the camera without a tween (one frame draws it) and returns the frame count read just before. */
async function moveCamera(page: Page): Promise<number> {
  return page.evaluate(() => {
    const api = window.__rmr!.map!;
    const f = window.__rmr!.frames ?? 0;
    const c = api.getCamera();
    api.setCamera({ ...c, zoom: c.zoom * 1.2 }, false);
    return f;
  });
}

test('waitForMapQuiet after a camera move does not pass before the late frame that draws the move', async ({ page }) => {
  await mapAtRest(page);
  // The quiet window (200 ms) is shorter than the delay (400 ms): a wait measured from the frame before the move,
  // or from the call's start, passes with no new frame drawn.
  await holdNextTick(page, 400);
  const before = await moveCamera(page);
  await waitForMapQuiet(page, 200);
  expect(await mapFrames(page), 'a frame drawn after the camera moved').toBeGreaterThan(before);
});

test('waitForMapQuiet with `since` waits for a frame after that count, however late it comes', async ({ page }) => {
  await mapAtRest(page);
  await holdNextCallback(page, 600);
  const before = await moveCamera(page);
  await waitForMapQuiet(page, 200, { since: before });
  expect(await mapFrames(page), 'a frame drawn after the camera moved').toBeGreaterThan(before);
});

test('waitForMapQuiet returns when nothing draws, and does not wait less than its quiet window', async ({ page }) => {
  await mapAtRest(page);
  const f0 = await mapFrames(page);
  const t0 = Date.now();
  await waitForMapQuiet(page, 300); // the map is at rest: nothing will draw
  expect(Date.now() - t0, 'a fresh quiet window, not the one the previous call already measured').toBeGreaterThanOrEqual(300);
  expect(await mapFrames(page)).toBe(f0);
});

test('waitForGasSharpSettled measures its quiet window afresh on each call', async ({ page }) => {
  await mapAtRest(page);
  await waitForGasSharpSettled(page, 500);
  await page.waitForTimeout(600); // longer than the window: a stale stamp from the first call would pass at once
  const t0 = Date.now();
  await waitForGasSharpSettled(page, 500);
  expect(Date.now() - t0).toBeGreaterThanOrEqual(500);
});
