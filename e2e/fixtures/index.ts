import { test as base, expect } from '@playwright/test';
import { AuthPage } from '../pages/auth.page';
import { JobBoardPage } from '../pages/job-board.page';

type E2EFixtures = {
  authPage: AuthPage;
  jobBoardPage: JobBoardPage;
};

export const test = base.extend<E2EFixtures>({
  // Keep page objects in fixtures so specs stay focused on user behavior.
  authPage: async ({ page }, runFixture) => {
    await runFixture(new AuthPage(page));
  },
  jobBoardPage: async ({ page }, runFixture) => {
    await runFixture(new JobBoardPage(page));
  },
});

export { expect };
