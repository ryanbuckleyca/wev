import { test as base, expect } from '@playwright/test';
import { JobBoardPage } from '../pages/job-board.page';

type E2EFixtures = {
  jobBoardPage: JobBoardPage;
};

export const test = base.extend<E2EFixtures>({
  // Keep page objects in fixtures so specs stay focused on user behavior.
  jobBoardPage: async ({ page }, runFixture) => {
    await runFixture(new JobBoardPage(page));
  },
});

export { expect };
