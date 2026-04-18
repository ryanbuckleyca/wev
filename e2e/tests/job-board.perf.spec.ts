import { test, expect } from '@e2e/fixtures';
import { expectJobBoardReady } from '@e2e/support/job-board';
import {
  attachPerformanceSnapshot,
  readElapsedNavigationTime,
  readPagePerformanceSnapshot,
} from '@e2e/support/performance';

const isCI = !!process.env.CI;
const JOB_BOARD_PERFORMANCE_BUDGET_MS = {
  domContentLoadedMs: isCI ? 2_500 : 5_000,
  interactiveReadyMs: isCI ? 2_500 : 5_000,
  loadEventMs: isCI ? 3_500 : 7_000,
  responseStartMs: isCI ? 1_500 : 3_500,
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
