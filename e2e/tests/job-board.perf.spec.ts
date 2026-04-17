import { test, expect } from '@e2e/fixtures';
import { expectJobBoardReady } from '@e2e/support/job-board';
import { JOB_BOARD_TEST_IDS } from '@/lib/testing/job-board-contract';
import {
  attachPerformanceSnapshot,
  readElapsedNavigationTime,
  readPagePerformanceSnapshot,
} from '@e2e/support/performance';

const JOB_BOARD_PERFORMANCE_BUDGET_MS = {
  domContentLoadedMs: 1_800,
  interactiveReadyMs: 1_800,
  loadEventMs: 2_800,
  responseStartMs: 1_000,
} as const;

const POST_READY_LOADING_GUARD_MS = 2_500;

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
});

test.describe('Job board performance @perf', () => {
  test.describe.configure({ retries: 0 });

  test('renders the seeded English bulletin within the baseline budget @perf', async ({
    jobBoardPage,
    expectations,
  }, testInfo) => {
    await jobBoardPage.goto('en', undefined, { waitUntil: 'commit' });

    await expectJobBoardReady(jobBoardPage, 'en');
    await expect(jobBoardPage.jobCards).toHaveCount(expectations.firstPageCount);
    await expect(jobBoardPage.paginationSummary).toContainText(
      String(expectations.jobCount),
    );

    const loadingStateLocator = jobBoardPage.page.getByTestId(JOB_BOARD_TEST_IDS.pageLoadingState);
    await expect(loadingStateLocator).toHaveCount(0);

    const loadingStateReappeared = await jobBoardPage.page
      .waitForSelector(`[data-testid="${JOB_BOARD_TEST_IDS.pageLoadingState}"]`, {
        state: 'attached',
        timeout: POST_READY_LOADING_GUARD_MS,
      })
      .then(() => true)
      .catch(() => false);

    expect(loadingStateReappeared).toBe(false);

    const interactiveReadyMs = await readElapsedNavigationTime(jobBoardPage.page);

    await jobBoardPage.page.waitForLoadState('load');

    const snapshot = await readPagePerformanceSnapshot(jobBoardPage.page, interactiveReadyMs);
    await attachPerformanceSnapshot(testInfo, 'job-board-performance', snapshot);

    expect(snapshot.responseStartMs).toBeLessThanOrEqual(
      JOB_BOARD_PERFORMANCE_BUDGET_MS.responseStartMs,
    );
    expect(snapshot.domContentLoadedMs).toBeLessThanOrEqual(
      JOB_BOARD_PERFORMANCE_BUDGET_MS.domContentLoadedMs,
    );
    expect(snapshot.interactiveReadyMs).toBeLessThanOrEqual(
      JOB_BOARD_PERFORMANCE_BUDGET_MS.interactiveReadyMs,
    );
    expect(snapshot.loadEventMs).toBeLessThanOrEqual(JOB_BOARD_PERFORMANCE_BUDGET_MS.loadEventMs);
  });
});
