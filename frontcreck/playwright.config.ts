import { defineConfig } from '@playwright/test';

const PORT = 3100;
const dev = process.env.E2E_DEV === '1';
// Software WebGL in headless Chrome (Chrome no longer falls back to SwiftShader on its own).
const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/playwright',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Playwright's bundled Chromium, not the system Chrome channel: Chrome starts GoogleUpdater, which kept
    // worker teardown from finishing. Only GPU runs (npm run perf, npm run shots) use the Chrome channel.
    trace: 'retain-on-failure',
    launchOptions: { args: WEBGL_ARGS },
  },
  projects: [
    { name: 'desktop', testIgnore: /(nowebgl|webgl1)\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'phone',
      testIgnore: /(nowebgl|webgl1)\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
    {
      name: 'nowebgl',
      testMatch: /nowebgl\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--disable-3d-apis'] } },
    },
    // WebGL1 without WebGL2: the page stubs getContext('webgl2') to return null (e2e/webgl1.spec.ts).
    { name: 'webgl1', testMatch: /webgl1\.spec\.ts/, use: { viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: dev ? `npx next dev --port ${PORT}` : `npm run build && npx next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
