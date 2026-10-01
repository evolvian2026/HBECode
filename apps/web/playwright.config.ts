import { defineConfig } from '@playwright/test';

/**
 * Browser end-to-end tests against a running stack (web on :3000, API on :4000, executor).
 * `CHROMIUM_PATH` lets CI or sandboxes use a preinstalled browser.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
});
