import { test, expect } from '../fixtures';
import type { JobBoardPage } from '../pages/job-board.page';
import { SEEDED_JOB_BOARD_EXPECTATIONS } from '../support/seed-dataset';
import { expectJobBoardReady, loadEnglishJobBoard } from '../support/job-board';

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

async function expectVisibleResults(jobBoardPage: JobBoardPage, totalJobs: number): Promise<void> {
  await expect(jobBoardPage.paginationSummary).toContainText(String(totalJobs));

  if (totalJobs === 0) {
    await expect(jobBoardPage.emptyState).toBeVisible();
    await expect(jobBoardPage.jobCards).toHaveCount(0);
    return;
  }

  await expect(jobBoardPage.jobCards).toHaveCount(
    Math.min(totalJobs, SEEDED_JOB_BOARD_EXPECTATIONS.firstPageCount),
  );
}

test.describe('Job board', () => {
  test('loads the English job board with seeded jobs', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);
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

  test('search narrows the list to a matching seeded job', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.searchFor(SEEDED_JOB_BOARD_EXPECTATIONS.sampleJobs.searchMatch);

    await expect
      .poll(() => new URL(jobBoardPage.page.url()).searchParams.get('q'))
      .toBe(SEEDED_JOB_BOARD_EXPECTATIONS.sampleJobs.searchMatch);
    await expectVisibleResults(jobBoardPage, 1);
  });

  test('shows the empty state when search removes every job', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);
    await expect(jobBoardPage.jobCards.first()).toBeVisible();

    await jobBoardPage.searchFor('no-such-role-for-playwright');

    await expect
      .poll(() => new URL(jobBoardPage.page.url()).searchParams.get('q'))
      .toBe('no-such-role-for-playwright');
    await expectVisibleResults(jobBoardPage, 0);
  });

  test('paginates through the seeded dataset', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);
    await expect(jobBoardPage.paginationSummary).toContainText('1-20');

    await jobBoardPage.goToPage(2);

    await expect.poll(() => new URL(jobBoardPage.page.url()).searchParams.get('page')).toBe('2');
    await expect(jobBoardPage.jobCards).toHaveCount(SEEDED_JOB_BOARD_EXPECTATIONS.secondPageCount);
    await expect(jobBoardPage.paginationSummary).toContainText('21-25');
    await expect(jobBoardPage.paginationSummary).toContainText(
      String(SEEDED_JOB_BOARD_EXPECTATIONS.jobCount),
    );
  });

  test('filters to jobs posted within one week', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.selectFilterButton('postedWithin', FILTER_LABELS.postedWithin.oneWeek);

    await expectVisibleResults(jobBoardPage, SEEDED_JOB_BOARD_EXPECTATIONS.oneWeekCount);
  });

  for (const workTypeCase of [
    { label: FILTER_LABELS.workType.remote, total: SEEDED_JOB_BOARD_EXPECTATIONS.workTypeCounts.remote },
    { label: FILTER_LABELS.workType.hybrid, total: SEEDED_JOB_BOARD_EXPECTATIONS.workTypeCounts.hybrid },
    { label: FILTER_LABELS.workType.office, total: SEEDED_JOB_BOARD_EXPECTATIONS.workTypeCounts.office },
  ]) {
    test(`filters by work type: ${workTypeCase.label}`, async ({ jobBoardPage }) => {
      await loadEnglishJobBoard(jobBoardPage);

      await jobBoardPage.selectFilterButton('workType', workTypeCase.label);

      await expectVisibleResults(jobBoardPage, workTypeCase.total);
    });
  }

  for (const sourceCase of [
    {
      label: FILTER_LABELS.source.wevOpportunities,
      total: SEEDED_JOB_BOARD_EXPECTATIONS.sourceCounts.wevOpportunities,
    },
    {
      label: FILTER_LABELS.source.communityImpactJobs,
      total: SEEDED_JOB_BOARD_EXPECTATIONS.sourceCounts.communityImpactJobs,
    },
    {
      label: FILTER_LABELS.source.solidarityCareers,
      total: SEEDED_JOB_BOARD_EXPECTATIONS.sourceCounts.solidarityCareers,
    },
  ]) {
    test(`filters by source: ${sourceCase.label}`, async ({ jobBoardPage }) => {
      await loadEnglishJobBoard(jobBoardPage);

      await jobBoardPage.toggleFilterCheckbox('source', sourceCase.label);

      await expectVisibleResults(jobBoardPage, sourceCase.total);
    });
  }

  test('filters by organization', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.toggleFilterCheckbox('organization', FILTER_LABELS.organization.partner1);

    await expectVisibleResults(
      jobBoardPage,
      SEEDED_JOB_BOARD_EXPECTATIONS.organizationCounts.partner1,
    );
  });

  for (const employmentTypeCase of [
    {
      label: FILTER_LABELS.employmentType.fullTime,
      total: SEEDED_JOB_BOARD_EXPECTATIONS.employmentTypeCounts.fullTime,
    },
    {
      label: FILTER_LABELS.employmentType.contract,
      total: SEEDED_JOB_BOARD_EXPECTATIONS.employmentTypeCounts.contract,
    },
  ]) {
    test(`filters by employment type: ${employmentTypeCase.label}`, async ({ jobBoardPage }) => {
      await loadEnglishJobBoard(jobBoardPage);

      await jobBoardPage.toggleFilterCheckbox('employmentType', employmentTypeCase.label);

      await expectVisibleResults(jobBoardPage, employmentTypeCase.total);
    });
  }

  for (const provinceCase of [
    { label: FILTER_LABELS.province.on, total: SEEDED_JOB_BOARD_EXPECTATIONS.provinceCounts.on },
    { label: FILTER_LABELS.province.qc, total: SEEDED_JOB_BOARD_EXPECTATIONS.provinceCounts.qc },
  ]) {
    test(`filters by province: ${provinceCase.label}`, async ({ jobBoardPage }) => {
      await loadEnglishJobBoard(jobBoardPage);

      await jobBoardPage.toggleFilterCheckbox('province', provinceCase.label);

      await expectVisibleResults(jobBoardPage, provinceCase.total);
    });
  }

  test('filters by municipality', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.toggleFilterCheckbox('municipality', FILTER_LABELS.municipality.toronto);

    await expectVisibleResults(
      jobBoardPage,
      SEEDED_JOB_BOARD_EXPECTATIONS.municipalityCounts.toronto,
    );
  });

  test('hides salaryless jobs when salary filtering is disabled', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.setBooleanFilter('salary', false);
    await expectVisibleResults(jobBoardPage, SEEDED_JOB_BOARD_EXPECTATIONS.salaryListedCount);

    await jobBoardPage.searchFor(SEEDED_JOB_BOARD_EXPECTATIONS.sampleJobs.salarylessVisible);
    await expectVisibleResults(jobBoardPage, 0);
  });

  test('reveals non-SSE jobs when the SSE-only filter is disabled', async ({ jobBoardPage }) => {
    await loadEnglishJobBoard(jobBoardPage);

    await jobBoardPage.setBooleanFilter('sse', false);
    await expectVisibleResults(jobBoardPage, SEEDED_JOB_BOARD_EXPECTATIONS.sseOffCount);

    await jobBoardPage.searchFor(SEEDED_JOB_BOARD_EXPECTATIONS.sampleJobs.nonSseOnly);
    await expectVisibleResults(jobBoardPage, 1);
  });
});
