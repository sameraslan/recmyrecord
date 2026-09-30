import type { Browser } from '@playwright/test';

export function assertNativeChrome(browser: Browser): Promise<string>;
