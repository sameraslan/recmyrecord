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
