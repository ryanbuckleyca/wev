import type { Page, TestInfo } from '@playwright/test';

export type PagePerformanceSnapshot = {
  domContentLoadedMs: number;
  interactiveReadyMs: number;
  loadEventMs: number;
  responseStartMs: number;
};

export async function readElapsedNavigationTime(page: Page): Promise<number> {
  return page.evaluate(() => Math.round(performance.now()));
}

export async function readPagePerformanceSnapshot(
  page: Page,
  interactiveReadyMs: number,
): Promise<PagePerformanceSnapshot> {
  return page.evaluate((readyTimeMs) => {
    const [navigationEntry] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];

    if (!navigationEntry) {
      throw new Error('Navigation timing entry unavailable.');
    }

    return {
      domContentLoadedMs: Math.round(navigationEntry.domContentLoadedEventEnd),
      interactiveReadyMs: Math.round(readyTimeMs),
      loadEventMs: Math.round(navigationEntry.loadEventEnd),
      responseStartMs: Math.round(navigationEntry.responseStart),
    };
  }, interactiveReadyMs);
}

export async function attachPerformanceSnapshot(
  testInfo: TestInfo,
  name: string,
  snapshot: PagePerformanceSnapshot,
): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(snapshot, null, 2)),
    contentType: 'application/json',
  });
}
