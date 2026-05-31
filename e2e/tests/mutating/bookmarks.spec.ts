import { test, expect } from "@e2e/fixtures";
import { loadEnglishJobBoard } from "@e2e/support/job-board";
import { JOB_BOARD_TEST_IDS } from "@/lib/testing/job-board-contract";

test.describe("Bookmarks flow", () => {
  test.setTimeout(120_000);

  test("bookmarks from job board and shows it on bookmarks page", async ({
    jobBoardPage,
    loggedInUser,
    page,
  }) => {
    void loggedInUser;

    await loadEnglishJobBoard(jobBoardPage);

    const firstCard = jobBoardPage.jobCards.first();
    await expect(firstCard).toBeVisible();

    // Wait for auth session to hydrate in the client before interacting with
    // auth-gated actions. The user avatar/menu button only appears once the
    // session is resolved, so it's a reliable signal that userId is available.
    await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible({
      timeout: 10_000,
    });

    const cardLabel = (await firstCard.getAttribute("aria-label")) ?? "";
    const jobTitle = cardLabel.split(" at ")[0]?.trim() ?? "";
    expect(jobTitle.length).toBeGreaterThan(0);

    const bookmarkButton = firstCard.getByTestId(
      JOB_BOARD_TEST_IDS.bookmarkButton,
    );

    // Wait for the button to be enabled — it's disabled while bookmarkLoading is true.
    // This also ensures effectiveUserId has propagated; if userId is null the click
    // would redirect to /login instead of toggling.
    await expect(bookmarkButton).toBeEnabled({ timeout: 10_000 });
    await bookmarkButton.click();

    // Expect the button state to change to bookmarked
    await expect(bookmarkButton).toHaveAttribute(
      "aria-label",
      /bookmarked|remove bookmark/i,
      { timeout: 10_000 },
    );
    // Wait for the loading state to finish before navigating to ensure state persistence
    await expect(bookmarkButton).not.toHaveAttribute("aria-busy", "true", {
      timeout: 10_000,
    });

    await page.goto("/en/bookmarks");
    await expect(
      page.getByRole("heading", { name: /my bookmarks/i }),
    ).toBeVisible({
      timeout: 10_000,
    });

    await expect(
      jobBoardPage.jobCards.filter({ hasText: jobTitle }).first(),
    ).toBeVisible({
      timeout: 10_000,
    });
  });
});
