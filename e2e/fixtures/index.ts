import { test as base, expect } from '@playwright/test';
import { JobBoardPage } from '../pages/job-board.page';

type E2EFixtures = {
  jobBoardPage: JobBoardPage;
};

export const test = base.extend<E2EFixtures>({
  // Keep shared page objects in fixtures so specs stay focused on behavior.
  jobBoardPage: async ({ page }, use) => {
    await use(new JobBoardPage(page));
  },
});

export { expect };
