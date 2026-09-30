import { chromium } from '@playwright/test';
import { assertNativeChrome } from '../scripts/check-native.mjs';

export default async function globalSetup(): Promise<void> {
  const browser = await chromium.launch();
  try {
    await assertNativeChrome(browser);
  } finally {
    await browser.close();
  }
}
