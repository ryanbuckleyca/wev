import { type Locator, type Page } from '@playwright/test';
import { getLocalizedPathname, type AppLocale } from '../../i18n/routing';
import { JOB_BOARD_TEST_IDS } from '../../lib/testing/job-board-contract';

export type JobBoardLocale = AppLocale;
type QueryParamPrimitive = boolean | number | string;
type QueryParamValue =
  | QueryParamPrimitive
  | readonly QueryParamPrimitive[]
  | null
  | undefined;
type QueryParamsInput = Record<string, QueryParamValue> | URLSearchParams | undefined;

function buildSearchParams(query?: QueryParamsInput): URLSearchParams {
  if (!query) {
    return new URLSearchParams();
  }

  if (query instanceof URLSearchParams) {
    return new URLSearchParams(query);
  }

  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue == null) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        params.append(key, String(value));
      }
      continue;
    }

    params.append(key, String(rawValue));
  }

  return params;
}

function buildJobBoardUrl(locale: JobBoardLocale, query?: QueryParamsInput): string {
  const pathname = `/${locale}${getLocalizedPathname('/jobs', locale)}`;
  const searchParams = buildSearchParams(query).toString();
  return searchParams ? `${pathname}?${searchParams}` : pathname;
}

export class JobBoardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly localeSwitcher: Locator;
  readonly jobCards: Locator;
  readonly paginationSummary: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1 });
    this.searchInput = page.getByRole('textbox', {
      name: /search jobs|rechercher des emplois/i,
    });
    this.localeSwitcher = page.getByTestId(JOB_BOARD_TEST_IDS.localeSwitcher);
    this.jobCards = page.getByTestId(JOB_BOARD_TEST_IDS.jobCard);
    this.paginationSummary = page.getByTestId(JOB_BOARD_TEST_IDS.paginationSummary);
    this.emptyState = page.getByTestId(JOB_BOARD_TEST_IDS.emptyState);
  }

  async goto(locale: JobBoardLocale, query?: QueryParamsInput): Promise<void> {
    await this.page.goto(buildJobBoardUrl(locale, query));
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.page.getByRole('link', { name: String(pageNumber), exact: true }).click();
  }

  async switchLocale(): Promise<JobBoardLocale> {
    const nextLocale = this.currentLocale() === 'en' ? 'fr' : 'en';
    await this.localeSwitcher.click();
    return nextLocale;
  }

  async searchFor(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  currentLocale(): JobBoardLocale {
    const pathname = new URL(this.page.url()).pathname;
    return pathname.startsWith('/fr/') ? 'fr' : 'en';
  }
}
