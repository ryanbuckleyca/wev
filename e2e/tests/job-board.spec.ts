import { test, expect } from '../fixtures';
import type { JobBoardPage } from '../pages/job-board.page';
import { expectJobBoardReady, loadEnglishJobBoard } from '../support/job-board';
import { SEEDED_JOB_BOARD_EXPECTATIONS } from '@supabase/dataset';

const FILTER_LABELS = {
  employmentType: {
    contract: 'contract',
    fullTime: 'full-time',
  },
  municipality: {
    toronto: 'Toronto',
  },
  organization: {
    partner1: 'WEV Partner 1',
  },
  postedWithin: {
    oneWeek: '1 week',
  },
  province: {
    on: 'ON',
    qc: 'QC',
  },
  source: {
    csi: 'Centre for Social Innovation',
    goodwork: 'GoodWork',
    centraide: 'Centraide',
  },
  workType: {
    hybrid: 'Hybrid',
    office: 'Office',
    remote: 'Remote',
  },
} as const;

async function expectVisibleResults(
  jobBoardPage: JobBoardPage,
  totalJobs: number,
  expectations: typeof SEEDED_JOB_BOARD_EXPECTATIONS,
): Promise<void> {
  await expect(jobBoardPage.paginationSummary).toContainText(String(totalJobs));

  if (totalJobs === 0) {
    await expect(jobBoardPage.emptyState).toBeVisible();
    await expect(jobBoardPage.jobCards).toHaveCount(0);
    return;
  }

  await expect(jobBoardPage.jobCards).toHaveCount(
    Math.min(totalJobs, expectations.firstPageCount),
  );
}

test.describe('Job board', () => {
  test.describe.configure({ mode: 'parallel' });

  test('loads the English job board with seeded jobs', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);
    await expect(jobBoardPage.jobCards).toHaveCount(expectations.firstPageCount);
    await expect(jobBoardPage.jobCards.first()).toBeVisible();
    await expect(jobBoardPage.paginationSummary).toContainText('1-20');
    await expect(jobBoardPage.paginationSummary).toContainText(
      String(expectations.jobCount),
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

  test('search narrows the list to a matching seeded job', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.searchFor(expectations.sampleJobs.searchMatch);

    await expect
      .poll(() => new URL(jobBoardPage.page.url()).searchParams.get('q'))
      .toBe(expectations.sampleJobs.searchMatch);
    await expectVisibleResults(jobBoardPage, 1, expectations);
  });

  test('shows the empty state when search removes every job', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);
    await expect(jobBoardPage.jobCards.first()).toBeVisible();

    await jobBoardPage.searchFor('no-such-role-for-playwright');

    await expect
      .poll(() => new URL(jobBoardPage.page.url()).searchParams.get('q'))
      .toBe('no-such-role-for-playwright');
    await expectVisibleResults(jobBoardPage, 0, expectations);
  });

  test('paginates through the seeded dataset', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);
    await expect(jobBoardPage.paginationSummary).toContainText('1-20');

    await jobBoardPage.goToPage(2);

    await expect.poll(() => new URL(jobBoardPage.page.url()).searchParams.get('page')).toBe('2');
    await expect(jobBoardPage.jobCards).toHaveCount(expectations.secondPageCount);
    await expect(jobBoardPage.paginationSummary).toContainText('21-25');
    await expect(jobBoardPage.paginationSummary).toContainText(
      String(expectations.jobCount),
    );
  });

  test('filters to jobs posted within one week', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.selectFilterButton('postedWithin', FILTER_LABELS.postedWithin.oneWeek);

    await expectVisibleResults(jobBoardPage, expectations.oneWeekCount, expectations);
  });

  for (const key of ['remote', 'hybrid', 'office'] as const) {
    test(`filters by work type: ${FILTER_LABELS.workType[key]}`, async ({ jobBoardPage, expectations }) => {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.selectFilterButton('workType', FILTER_LABELS.workType[key]);
      await expectVisibleResults(jobBoardPage, expectations.workTypeCounts[key], expectations);
    });
  }

  for (const key of ['csi', 'goodwork', 'centraide'] as const) {
    test(`filters by source: ${FILTER_LABELS.source[key]}`, async ({ jobBoardPage, expectations }) => {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.toggleFilterCheckbox('source', FILTER_LABELS.source[key]);
      await expectVisibleResults(jobBoardPage, expectations.sourceCounts[key], expectations);
    });
  }

  test('filters by organization', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.toggleFilterCheckbox('organization', FILTER_LABELS.organization.partner1);

    await expectVisibleResults(
      jobBoardPage,
      expectations.organizationCounts.partner1,
      expectations,
    );
  });

  for (const key of ['fullTime', 'contract'] as const) {
    test(`filters by employment type: ${FILTER_LABELS.employmentType[key]}`, async ({ jobBoardPage, expectations }) => {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.toggleFilterCheckbox('employmentType', FILTER_LABELS.employmentType[key]);
      await expectVisibleResults(jobBoardPage, expectations.employmentTypeCounts[key], expectations);
    });
  }

  for (const key of ['on', 'qc'] as const) {
    test(`filters by province: ${FILTER_LABELS.province[key]}`, async ({ jobBoardPage, expectations }) => {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.toggleFilterCheckbox('province', FILTER_LABELS.province[key]);
      await expectVisibleResults(jobBoardPage, expectations.provinceCounts[key], expectations);
    });
  }

  test('filters by municipality', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.toggleFilterCheckbox('municipality', FILTER_LABELS.municipality.toronto);

    await expectVisibleResults(
      jobBoardPage,
      expectations.municipalityCounts.toronto,
      expectations,
    );
  });

  test('hides salaryless jobs when salary filtering is disabled', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.setBooleanFilter('salary', false);
    await expectVisibleResults(jobBoardPage, expectations.salaryListedCount, expectations);

    await jobBoardPage.searchFor(expectations.sampleJobs.salarylessVisible);
    await expectVisibleResults(jobBoardPage, 0, expectations);
  });

  test('reveals non-SSE jobs when the SSE-only filter is disabled', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.setBooleanFilter('sse', false);
    await expectVisibleResults(jobBoardPage, expectations.sseOffCount, expectations);

    await jobBoardPage.searchFor(expectations.sampleJobs.nonSseOnly);
    await expectVisibleResults(jobBoardPage, 1, expectations);
  });
});
