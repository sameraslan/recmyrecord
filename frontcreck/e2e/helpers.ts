import type { Page, TestInfo } from '@playwright/test';

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
