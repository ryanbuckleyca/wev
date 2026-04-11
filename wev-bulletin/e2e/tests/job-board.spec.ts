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
    communityImpactJobs: 'Community Impact Jobs',
    solidarityCareers: 'Solidarity Careers',
    wevOpportunities: 'WEV Opportunities',
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

  const WORK_TYPE_CASES = (expectations: typeof SEEDED_JOB_BOARD_EXPECTATIONS) => [
    {
      label: FILTER_LABELS.workType.remote,
      total: expectations.workTypeCounts.remote,
    },
    {
      label: FILTER_LABELS.workType.hybrid,
      total: expectations.workTypeCounts.hybrid,
    },
    {
      label: FILTER_LABELS.workType.office,
      total: expectations.workTypeCounts.office,
    },
  ];

  test('filters by work types', async ({ jobBoardPage, expectations }) => {
    for (const workTypeCase of WORK_TYPE_CASES(expectations)) {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.selectFilterButton('workType', workTypeCase.label);
      await expectVisibleResults(jobBoardPage, workTypeCase.total, expectations);
    }
  });

  const SOURCE_CASES = (expectations: typeof SEEDED_JOB_BOARD_EXPECTATIONS) => [
    {
      label: FILTER_LABELS.source.wevOpportunities,
      total: expectations.sourceCounts.wevOpportunities,
    },
    {
      label: FILTER_LABELS.source.communityImpactJobs,
      total: expectations.sourceCounts.communityImpactJobs,
    },
    {
      label: FILTER_LABELS.source.solidarityCareers,
      total: expectations.sourceCounts.solidarityCareers,
    },
  ];

  test('filters by sources', async ({ jobBoardPage, expectations }) => {
    for (const sourceCase of SOURCE_CASES(expectations)) {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.toggleFilterCheckbox('source', sourceCase.label);
      await expectVisibleResults(jobBoardPage, sourceCase.total, expectations);
    }
  });

  test('filters by organization', async ({ jobBoardPage, expectations }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.toggleFilterCheckbox('organization', FILTER_LABELS.organization.partner1);

    await expectVisibleResults(
      jobBoardPage,
      expectations.organizationCounts.partner1,
      expectations,
    );
  });

  const EMPLOYMENT_TYPE_CASES = (expectations: typeof SEEDED_JOB_BOARD_EXPECTATIONS) => [
    {
      label: FILTER_LABELS.employmentType.fullTime,
      total: expectations.employmentTypeCounts.fullTime,
    },
    {
      label: FILTER_LABELS.employmentType.contract,
      total: expectations.employmentTypeCounts.contract,
    },
  ];

  test('filters by employment types', async ({ jobBoardPage, expectations }) => {
    for (const employmentTypeCase of EMPLOYMENT_TYPE_CASES(expectations)) {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.toggleFilterCheckbox('employmentType', employmentTypeCase.label);
      await expectVisibleResults(jobBoardPage, employmentTypeCase.total, expectations);
    }
  });

  const PROVINCE_CASES = (expectations: typeof SEEDED_JOB_BOARD_EXPECTATIONS) => [
    { label: FILTER_LABELS.province.on, total: expectations.provinceCounts.on },
    { label: FILTER_LABELS.province.qc, total: expectations.provinceCounts.qc },
  ];

  test('filters by provinces', async ({ jobBoardPage, expectations }) => {
    for (const provinceCase of PROVINCE_CASES(expectations)) {
      await loadEnglishJobBoard(jobBoardPage);
      await jobBoardPage.toggleFilterCheckbox('province', provinceCase.label);
      await expectVisibleResults(jobBoardPage, provinceCase.total, expectations);
    }
  });

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
