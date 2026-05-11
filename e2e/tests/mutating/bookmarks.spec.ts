import { test, expect } from "@e2e/fixtures";
import { loadEnglishJobBoard } from "@e2e/support/job-board";

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

    const cardLabel = (await firstCard.getAttribute("aria-label")) ?? "";
    const jobTitle = cardLabel.split(" at ")[0]?.trim() ?? "";
    expect(jobTitle.length).toBeGreaterThan(0);

    const bookmarkButton = firstCard.getByTestId("job-card-bookmark-button");
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
