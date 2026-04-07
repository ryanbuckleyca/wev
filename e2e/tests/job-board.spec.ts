import { getLocalizedPathname, type AppLocale } from '../../i18n/routing';
import { test, expect } from '../fixtures';
import { SEEDED_JOB_BOARD_EXPECTATIONS } from '../support/seed-dataset';
import type { JobBoardPage } from '../pages/job-board.page';

function getJobBoardPath(locale: AppLocale): string {
  return `/${locale}${getLocalizedPathname('/jobs', locale)}`;
}

async function expectJobBoardReady(jobBoardPage: JobBoardPage, locale: AppLocale): Promise<void> {
  await expect
    .poll(() => new URL(jobBoardPage.page.url()).pathname)
    .toBe(getJobBoardPath(locale));
  await expect(jobBoardPage.page.locator('html')).toHaveAttribute('lang', locale);
  await expect(jobBoardPage.heading).toBeVisible();
  await expect(jobBoardPage.searchInput).toBeVisible();
  await expect(jobBoardPage.localeSwitcher).toBeVisible();
}

test.describe('Job board', () => {
  test('loads the English job board with seeded jobs', async ({ jobBoardPage }) => {
    await jobBoardPage.goto('en');

    await expectJobBoardReady(jobBoardPage, 'en');
    await expect(jobBoardPage.jobCards).toHaveCount(SEEDED_JOB_BOARD_EXPECTATIONS.firstPageCount);
    await expect(jobBoardPage.jobCards.first()).toBeVisible();
    await expect(jobBoardPage.paginationSummary).toContainText('1-20');
    await expect(jobBoardPage.paginationSummary).toContainText(
      String(SEEDED_JOB_BOARD_EXPECTATIONS.jobCount),
    );
  });

  test('switches locales without losing repeated query params', async ({ jobBoardPage }) => {
    await jobBoardPage.goto('en', {
      ref: ['career-profile', 'saved-search'],
      tag: ['new-user', 'saved-jobs'],
    });

    await expectJobBoardReady(jobBoardPage, 'en');
    await expect(jobBoardPage.jobCards.first()).toBeVisible();

    const nextLocale = await jobBoardPage.switchLocale();

    await expectJobBoardReady(jobBoardPage, nextLocale);
    await expect
      .poll(() => new URL(jobBoardPage.page.url()).searchParams.getAll('ref'))
      .toEqual(['career-profile', 'saved-search']);
    await expect
      .poll(() => new URL(jobBoardPage.page.url()).searchParams.getAll('tag'))
      .toEqual(['new-user', 'saved-jobs']);
  });

  test('shows the empty state when search removes every job', async ({ jobBoardPage }) => {
    await jobBoardPage.goto('en');

    await expectJobBoardReady(jobBoardPage, 'en');
    await expect(jobBoardPage.jobCards.first()).toBeVisible();

    await jobBoardPage.searchFor('no-such-role-for-playwright');

    await expect
      .poll(() => new URL(jobBoardPage.page.url()).searchParams.get('q'))
      .toBe('no-such-role-for-playwright');
    await expect(jobBoardPage.emptyState).toBeVisible();
    await expect(jobBoardPage.jobCards).toHaveCount(0);
  });

  test('paginates through the seeded dataset', async ({ jobBoardPage }) => {
    await jobBoardPage.goto('en');

    await expectJobBoardReady(jobBoardPage, 'en');
    await expect(jobBoardPage.paginationSummary).toContainText('1-20');

    await jobBoardPage.goToPage(2);

    await expect.poll(() => new URL(jobBoardPage.page.url()).searchParams.get('page')).toBe('2');
    await expect(jobBoardPage.jobCards).toHaveCount(SEEDED_JOB_BOARD_EXPECTATIONS.secondPageCount);
    await expect(jobBoardPage.paginationSummary).toContainText('21-25');
    await expect(jobBoardPage.paginationSummary).toContainText(
      String(SEEDED_JOB_BOARD_EXPECTATIONS.jobCount),
    );
  });
});
