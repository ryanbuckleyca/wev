import { test, expect } from "@e2e/fixtures";
import {
  countJobMatchesForUserId,
  recalculateMatchesForUserId,
} from "@e2e/support/auth-admin";
import { loadEnglishJobBoard } from "@e2e/support/job-board";

test.describe("Matching + job card interactions", () => {
  test.setTimeout(180_000);
  test.use({ viewport: { width: 420, height: 900 } });

  test("shows match UI and allows expanding/scrolling job-card pills", async ({
    jobBoardPage,
    loggedInUser,
    page,
  }) => {
    void loggedInUser;

    await test.step("Save a minimal profile to trigger match recalculation", async () => {
      await page.goto("/en/profile");
      await expect(
        page.getByRole("heading", { name: /^my profile$/i }),
      ).toBeVisible({
        timeout: 10_000,
      });

      // Add a couple of skills
      const skillsTrigger = page.getByRole("button", {
        name: /search and add skills/i,
      });
      await skillsTrigger.click();
      const skillsDialog = page.getByRole("dialog", {
        name: /search and select skills/i,
      });
      await expect(skillsDialog).toBeVisible();

      await skillsDialog.getByPlaceholder(/search to add skills/i).fill("a");
      const skillsListbox = skillsDialog.getByRole("listbox", {
        name: /skill search results/i,
      });
      await expect(skillsListbox.getByRole("option").first()).toBeVisible({
        timeout: 10_000,
      });
      await skillsListbox.getByRole("option").nth(0).click();
      await skillsListbox.getByRole("option").nth(1).click();

      await skillsDialog.getByRole("button", { name: /^done/i }).click();
      await expect(skillsDialog).toBeHidden();

      // Add a couple of values
      const valuesTrigger = page.getByRole("button", {
        name: /search and add work values/i,
      });
      await valuesTrigger.click();
      const valuesDialog = page.getByRole("dialog", {
        name: /search and select work values/i,
      });
      await expect(valuesDialog).toBeVisible();

      const valuesInput =
        valuesDialog.getByPlaceholder(/search to add values/i);
      const valuesListbox = valuesDialog.getByRole("listbox", {
        name: /work values/i,
      });

      for (const label of ["Location", "Knowledge"]) {
        await valuesInput.fill(label);
        await valuesListbox.getByText(label, { exact: true }).click();
      }

      await valuesDialog.getByRole("button", { name: /^done/i }).click();
      await expect(valuesDialog).toBeHidden();

      await page.getByRole("button", { name: /^save profile$/i }).click();
      await expect(
        page.getByText(/profile updated successfully/i).first(),
      ).toBeVisible({
        timeout: 10_000,
      });

      await recalculateMatchesForUserId(loggedInUser.id);
      await expect
        .poll(() => countJobMatchesForUserId(loggedInUser.id), {
          timeout: 90_000,
        })
        .toBeGreaterThan(0);
    });

    await test.step("Wait for match UI to appear on the job board", async () => {
      await loadEnglishJobBoard(jobBoardPage);

      await expect
        .poll(
          async () =>
            page.getByRole("button", { name: /view match details/i }).count(),
          {
            timeout: 90_000,
          },
        )
        .toBeGreaterThan(0);
    });

    await test.step("Open match details popover", async () => {
      const jobCard = jobBoardPage.jobCards
        .filter({
          has: page.getByRole("button", { name: /view match details/i }),
        })
        .first();

      await jobCard
        .getByRole("button", { name: /view match details/i })
        .click();
      await expect(page.getByText(/total match/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step("Expand pill groups and scroll", async () => {
      const jobCard = jobBoardPage.jobCards
        .filter({
          has: page.getByRole("button", { name: /view match details/i }),
        })
        .filter({ has: page.getByRole("button", { name: /^scroll right$/i }) })
        .first();

      // Open a summary pill tooltip (verifies pills are clickable)
      const valuesSummary = jobCard.getByRole("button", {
        name: /\d+\/\d+ values/i,
      });
      await valuesSummary.click();
      await expect(page.getByText(/click > to expand details/i)).toBeVisible({
        timeout: 10_000,
      });

      // Expand one group (some cards may have only one expandable summary)
      const expandButton = jobCard
        .getByRole("button", { name: /^expand$/i })
        .first();
      if (await expandButton.count()) {
        await expandButton.scrollIntoViewIfNeeded();
        await expandButton.click();
        await expect(
          jobCard.getByRole("button", { name: /^collapse$/i }).first(),
        ).toBeVisible({
          timeout: 10_000,
        });
      }

      // With a narrow viewport, scroll controls should appear.
      const scrollRight = jobCard.getByRole("button", {
        name: /^scroll right$/i,
      });
      await expect(scrollRight).toBeVisible({ timeout: 10_000 });
      await scrollRight.click();
    });
  });
});
