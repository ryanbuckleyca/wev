import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envTestPath = path.join(rootDir, '.env.test');

// Load base env without overriding vars already set in the process
dotenv.config({ path: envPath });
// Overlay test-specific overrides
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath, override: true });
}

const PLAYWRIGHT_PORT = 3000;
const PLAYWRIGHT_BASE_URL = `http://localhost:${PLAYWRIGHT_PORT}`;
process.env.PLAYWRIGHT_BASE_URL = PLAYWRIGHT_BASE_URL;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
console.log('▶ Playwright Config: Loading...');
const testDir = path.resolve(__dirname, 'tests');
console.log('▶ Playwright Config: testDir =', testDir);

export default defineConfig({
  testDir,
  outputDir: './e2e/.output',
  /* Allow selected suites to opt into parallel execution. */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: Boolean(process.env.CI),
  /* Retry on CI only */
  retries: process.env.CI ? 1 : 0,
  /* Two workers is a good fit for the hosted runner without overloading Next.js or Supabase. */
  workers: process.env.CI ? 2 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'e2e/results/junit.xml' }],
  ],
  
  /* Seed the database once before all tests */
  globalSetup: require.resolve('./global-setup.ts'),

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: PLAYWRIGHT_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  /* Skip @auth-email tests if MAILSLURP_API_KEY is missing */
  grepInvert: process.env.MAILSLURP_API_KEY ? undefined : /@auth-email/,

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
    cwd: path.resolve(__dirname, '../wev-bulletin'),
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
