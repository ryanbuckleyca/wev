import { defineConfig, devices } from '@playwright/test';
import { getWebServerEnv, loadPlaywrightEnv, PLAYWRIGHT_BASE_URL } from './e2e/support/test-env';

loadPlaywrightEnv();

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/.output',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'e2e/results/junit.xml' }],
  ],
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Playwright always boots the local production build against the dedicated
  // wev-test database so e2e runs stay deterministic.
  webServer: {
    command: `npx tsx ./e2e/support/start-server.ts`,
    env: getWebServerEnv(),
    url: PLAYWRIGHT_BASE_URL,
    // E2E needs a fresh server so cached bulletin data always matches the
    // seeded wev-test database for the current run.
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 240_000,
  },
});
