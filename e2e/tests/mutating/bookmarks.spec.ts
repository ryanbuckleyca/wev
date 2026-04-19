import { test, expect } from '@e2e/fixtures';
import { loadEnglishJobBoard } from '@e2e/support/job-board';

test.describe('Bookmarks flow', () => {
  test.setTimeout(120_000);

  test('bookmarks from job board and shows it on bookmarks page', async ({
    jobBoardPage,
    loggedInUser,
    page,
  }) => {
    void loggedInUser;

    await loadEnglishJobBoard(jobBoardPage);

    const firstCard = jobBoardPage.jobCards.first();
    await expect(firstCard).toBeVisible();

    const cardLabel = (await firstCard.getAttribute('aria-label')) ?? '';
    const jobTitle = cardLabel.split(' at ')[0]?.trim() ?? '';
    expect(jobTitle.length).toBeGreaterThan(0);

    const bookmarkButton = firstCard.getByRole('button', {
      name: /bookmark job|bookmarked|remove bookmark/i,
    });
    await bookmarkButton.click();

    await expect(
      firstCard.getByRole('button', {
        name: /bookmarked|remove bookmark/i,
      }),
    ).toBeVisible({ timeout: 10_000 });

    await page.goto('/en/bookmarks');
    await expect(page.getByRole('heading', { name: /my bookmarks/i })).toBeVisible({
      timeout: 10_000,
    });

    await expect(jobBoardPage.jobCards.filter({ hasText: jobTitle }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
