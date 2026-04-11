import { defineConfig, devices } from '@playwright/test';
const PLAYWRIGHT_PORT = 3000;
const PLAYWRIGHT_BASE_URL = `http://localhost:${PLAYWRIGHT_PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/.output',
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: Boolean(process.env.CI),
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'e2e/results/junit.xml' }],
  ],
  
  /* Seed the database once before all tests */
  globalSetup: require.resolve('./e2e/global-setup.ts'),

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // Run the production build for realistic and faster E2E tests
    command: 'npm run start',
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
    env: {
      NODE_ENV: 'test',
      NEXT_PUBLIC_SITE_URL: PLAYWRIGHT_BASE_URL,
      // The port is usually inferred from PLAYWRIGHT_BASE_URL but we can be explicit
      PORT: '3000',
    },
  },
});
