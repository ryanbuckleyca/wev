import { expect } from '@playwright/test';
import { getLocalizedPathname, type AppLocale } from '@/i18n/routing';
import type { JobBoardPage } from '../pages/job-board.page';

export function getJobBoardPath(locale: AppLocale): string {
  return `/${locale}${getLocalizedPathname('/jobs', locale)}`;
}

export async function expectJobBoardReady(
  jobBoardPage: JobBoardPage,
  locale: AppLocale,
): Promise<void> {
  await expect.poll(() => new URL(jobBoardPage.page.url()).pathname).toBe(getJobBoardPath(locale));
  await expect(jobBoardPage.page.locator('html')).toHaveAttribute('lang', locale);
  await expect(jobBoardPage.heading).toBeVisible();
  await expect(jobBoardPage.searchInput).toBeVisible();
  await expect(jobBoardPage.localeSwitcher).toBeVisible();
}

export async function loadEnglishJobBoard(jobBoardPage: JobBoardPage): Promise<void> {
  await jobBoardPage.goto('en');
  await expectJobBoardReady(jobBoardPage, 'en');
}
