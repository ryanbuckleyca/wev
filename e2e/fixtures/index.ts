import { test as base, expect } from "@playwright/test";
import { AuthPage } from "@e2e/pages/auth.page";
import { JobBoardPage } from "@e2e/pages/job-board.page";
import {
  createManagedE2EUser,
  deleteAuthUserByEmail,
} from "@e2e/support/auth-admin";
import { SEEDED_JOB_BOARD_EXPECTATIONS } from "@supabase/dataset";

type ManagedE2EUser = {
  email: string;
  id: string;
  password: string;
};

type E2EFixtures = {
  authPage: AuthPage;
  jobBoardPage: JobBoardPage;
  expectations: typeof SEEDED_JOB_BOARD_EXPECTATIONS;
  loggedInUser: ManagedE2EUser;
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

  // Deterministic authenticated user fixture for non-auth-flow E2E tests.
  loggedInUser: async ({ authPage, page }, runFixture, testInfo) => {
    const seed = `${testInfo.file}-${testInfo.title}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}`;
    const user = await createManagedE2EUser(seed);

    try {
      await authPage.gotoLogin("en");
      await authPage.login(user.email, user.password);
      await expect(page).toHaveURL(/\/en(\/)?$/, { timeout: 10_000 });
      await runFixture(user);
    } finally {
      await deleteAuthUserByEmail(user.email).catch(() => undefined);
    }
  },
});

export { expect };
