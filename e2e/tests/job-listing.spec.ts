import { test, expect } from '../fixtures';

test.describe('Bilingual job board', () => {
  test('loads the English jobs route with visible listings', async ({ jobBoardPage }) => {
    await jobBoardPage.gotoEnglishJobs();

    await jobBoardPage.expectLoaded('en');
    await jobBoardPage.expectJobCardsVisible();
  });

  test('loads the French localized jobs route with translated content', async ({
    jobBoardPage,
  }) => {
    await jobBoardPage.gotoFrenchJobs();

    await jobBoardPage.expectLoaded('fr');
    await jobBoardPage.expectJobCardsVisible();
  });

  test('switches locale without leaving the bulletin route', async ({ jobBoardPage }) => {
    await jobBoardPage.gotoEnglishJobs();
    await jobBoardPage.expectLoaded('en');
    await jobBoardPage.expectJobCardsVisible();

    const nextLocale = await jobBoardPage.switchLocale();

    await expect(jobBoardPage.page.locator('html')).toHaveAttribute('lang', nextLocale);
    await jobBoardPage.expectJobCardsVisible();
  });
});
