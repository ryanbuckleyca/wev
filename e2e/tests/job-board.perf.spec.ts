import { test, expect } from '@e2e/fixtures';
import { expectJobBoardReady } from '@e2e/support/job-board';
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

const POST_READY_SKELETON_WATCH_MS = 10_000;

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

    const skeletonReappearedAfterReady = await jobBoardPage.page.evaluate(async (watchMs) => {
      const selector = '#search-loading';

      const hasSkeleton = () => Boolean(document.querySelector(selector));
      if (hasSkeleton()) {
        return true;
      }

      return await new Promise<boolean>((resolve) => {
        const observer = new MutationObserver(() => {
          if (hasSkeleton()) {
            observer.disconnect();
            resolve(true);
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
          observer.disconnect();
          resolve(false);
        }, watchMs);
      });
    }, POST_READY_SKELETON_WATCH_MS);

    expect(skeletonReappearedAfterReady).toBe(false);

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
