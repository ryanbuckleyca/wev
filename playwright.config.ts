import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: path.resolve(process.cwd(), '.env.test') });

const localBaseURL = 'http://localhost:3001';
const baseURL = process.env.BASE_URL || localBaseURL;
const usingRemoteBaseURL =
  Boolean(process.env.BASE_URL) &&
  !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(baseURL);

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/.output',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'e2e/results/junit.xml' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  // Local runs boot Next automatically; CI can point BASE_URL at a preview deployment instead.
  webServer: usingRemoteBaseURL
    ? undefined
    : {
        command: 'npm run dev -- --port 3001',
        url: localBaseURL,
        reuseExistingServer: true,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120_000,
      },
});
