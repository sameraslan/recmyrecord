import type { AppState } from '@/lib/store';

declare global {
  interface Window {
    /** Read-only hooks for Playwright and the perf script. */
    __rmr?: {
      getState: () => AppState;
    };
  }
}

export {};
