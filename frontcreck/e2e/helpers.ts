import type { Locator, Page, Route, TestInfo } from '@playwright/test';

/** Saves a viewport screenshot to test-results/shots/<project>-<name>.png and returns the path. */
export async function shot(page: Page, info: TestInfo, name: string): Promise<string> {
  const file = `test-results/shots/${info.project.name}-${name}.png`;
  await page.screenshot({ path: file });
  return file;
}

export function isPhone(info: TestInfo): boolean {
  return info.project.name === 'phone';
}

/**
 * Waits until every cover under `scope` shows its final picture: a loaded remote image, a loaded
 * sprite, or the lettered tile, fully faded in. Screenshots call this so they never catch a cover mid-load.
 */
export async function coversSettled(page: Page, scope = 'body'): Promise<void> {
  await page.waitForFunction((sel) => {
    const covers = [...document.querySelectorAll<HTMLElement>(`${sel} .cover`)];
    return covers.every((c) => {
      const s = c.dataset.state;
      if (s === 'tile') return true;
      if (s === 'sprite') return !!c.querySelector('.spr');
      const img = c.querySelector('img.ok');
      return !!img && getComputedStyle(img).opacity === '1'; // after the fade-in, too
    });
  }, scope);
}

/** Waits until the map has loaded, rendered and exposed its API. */
export async function waitForMap(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__rmr?.map && (window.__rmr?.frames ?? 0) > 0, null, { timeout: 20_000 });
}

/** Waits until no camera animation is running and the map has stopped drawing. */
export async function waitForCameraIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__rmr?.map && !window.__rmr.map.isAnimating(), null, { timeout: 10_000 });
  await waitForMapQuiet(page, 120);
}

/** Waits until the map has drawn no frame for `quietMs` (cover fades and other redraws have finished). */
export async function waitForMapQuiet(page: Page, quietMs = 200): Promise<void> {
  await page.waitForFunction(
    (quiet) => {
      const w = window as unknown as { __quietF?: number; __quietT?: number };
      const f = window.__rmr?.frames ?? 0;
      const now = performance.now();
      if (w.__quietF !== f) {
        w.__quietF = f;
        w.__quietT = now;
        return false;
      }
      return now - (w.__quietT ?? now) >= quiet;
    },
    quietMs,
    { polling: 40, timeout: 15_000 },
  );
}

/** Waits until every finite CSS animation and transition on the page has finished. */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
  );
}

/** Client coordinates of an album that is on screen and not covered by another element. */
export async function visibleAlbumPoint(page: Page, from = 0, to = 600): Promise<{ id: number; x: number; y: number }> {
  const hit = await page.evaluate(
    ([a, b]) => {
      const api = window.__rmr!.map!;
      for (let id = a; id < b; id++) {
        const p = api.screenPoint(id);
        if (!p || p.x < 60 || p.y < 120 || p.x > innerWidth - 90 || p.y > innerHeight - 90) continue;
        const el = document.elementFromPoint(p.x, p.y);
        if (el && el.classList.contains('map-canvas')) return { id, x: p.x, y: p.y };
      }
      return null;
    },
    [from, to],
  );
  if (!hit) throw new Error('no visible album point');
  return hit;
}

export async function camera(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  return page.evaluate(() => window.__rmr!.map!.getCamera());
}

/** A real tap on phones and a real click on desktop. */
export async function act(target: Locator, isMobile: boolean): Promise<void> {
  if (isMobile) await target.tap();
  else await target.click();
}

/** Presses Tab until `predicate(focusedElement, arg)` holds; fails after `max` presses. The predicate runs in the
 * page, so it may use only its parameters: pass any outside value (for example a `COPY` label) as `arg`. */
export async function tabTo<A = undefined>(page: Page, predicate: (el: Element, arg: A) => boolean, max = 40, arg?: A): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(`(${predicate.toString()})(document.activeElement, ${JSON.stringify(arg ?? null)})`)) return;
  }
  throw new Error('element not reachable with Tab');
}

/** A 1 x 1 PNG. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
/** A Cover Art Archive cover's first request (it redirects to archive.org's file hosts, which can take many seconds). */
export const ARCHIVE_COVER_RE = /^https:\/\/coverartarchive\.org\//;

/**
 * Answers every Cover Art Archive cover with a tiny picture at once. For tests that open an album chosen from
 * the data, which may have such a cover: a page's load event waits for its header cover, and the archive's file
 * hosts are sometimes slow enough to run a test out of time. Returns the function that removes the answer.
 */
export async function answerArchiveCovers(page: Page): Promise<() => Promise<void>> {
  const handler = (route: Route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
  await page.route(ARCHIVE_COVER_RE, handler);
  return () => page.unroute(ARCHIVE_COVER_RE, handler);
}
