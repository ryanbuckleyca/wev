import { test as base, expect } from '@playwright/test';
import { AuthPage } from '../pages/auth.page';
import { JobBoardPage } from '../pages/job-board.page';
import { SEEDED_JOB_BOARD_EXPECTATIONS } from '@supabase/dataset';

type E2EFixtures = {
  authPage: AuthPage;
  jobBoardPage: JobBoardPage;
  expectations: typeof SEEDED_JOB_BOARD_EXPECTATIONS;
};

export const test = base.extend<E2EFixtures>({
  // Expectations delivered via fixture so tests don't need relative disk imports
  expectations: async ({}, runFixture) => {
    await runFixture(SEEDED_JOB_BOARD_EXPECTATIONS);
  },

  // Keep page objects in fixtures so specs stay focused on user behavior.
  authPage: async ({ page }, runFixture) => {
    await runFixture(new AuthPage(page));
  },
  jobBoardPage: async ({ page }, runFixture) => {
    await runFixture(new JobBoardPage(page));
  },
});

export { expect };
