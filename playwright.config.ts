// Browser tests (LAB-21). Run them with `pnpm test:e2e`, which starts the
// database, the API and the web app first (scripts/e2e.ts); Playwright
// alone has nothing to talk to.
import { defineConfig, devices } from '@playwright/test';

const webPort = process.env.WEB_PORT;
if (!webPort) {
  throw new Error('Run the browser tests with `pnpm test:e2e`.');
}

export default defineConfig({
  testDir: 'e2e',
  // One database, so one test at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  // A trace of every failed test: `pnpm exec playwright show-report`.
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
