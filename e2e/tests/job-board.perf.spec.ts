import { test, expect } from '../fixtures';
import { expectJobBoardReady } from '../support/job-board';
import {
  attachPerformanceSnapshot,
  readElapsedNavigationTime,
  readPagePerformanceSnapshot,
} from '../support/performance';

const JOB_BOARD_PERFORMANCE_BUDGET_MS = {
  domContentLoadedMs: 2_500,
  interactiveReadyMs: 2_500,
  loadEventMs: 3_500,
  responseStartMs: 1_500,
} as const;

test.use({
  screenshot: 'off',
  trace: 'off',
  video: 'off',
});

test.describe('Job board performance @perf', () => {
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
