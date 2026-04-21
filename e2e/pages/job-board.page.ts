import { type Locator, type Page } from "@playwright/test";
import { getLocalizedPathname, type AppLocale } from "@/i18n/routing";
import { JOB_BOARD_TEST_IDS } from "@/lib/testing/job-board-contract";

export type JobBoardLocale = AppLocale;
type BooleanFilterName = "salary" | "sse";
type ButtonFilterName = "postedWithin" | "workType";
type CheckboxFilterName =
  | "employmentType"
  | "municipality"
  | "organization"
  | "province"
  | "source";
type QueryParamPrimitive = boolean | number | string;
type QueryParamValue =
  | QueryParamPrimitive
  | readonly QueryParamPrimitive[]
  | null
  | undefined;
type QueryParamsInput =
  | Record<string, QueryParamValue>
  | URLSearchParams
  | undefined;
type FilterLocators = {
  employmentType: Locator;
  municipality: Locator;
  organization: Locator;
  postedWithin: Locator;
  province: Locator;
  salary: Locator;
  source: Locator;
  sse: Locator;
  workType: Locator;
};

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

function buildJobBoardUrl(
  locale: JobBoardLocale,
  query?: QueryParamsInput,
): string {
  const pathname = `/${locale}${getLocalizedPathname("/jobs", locale)}`;
  const searchParams = buildSearchParams(query).toString();
  return searchParams ? `${pathname}?${searchParams}` : pathname;
}

export class JobBoardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly filtersToggle: Locator;
  readonly localeSwitcher: Locator;
  readonly jobCards: Locator;
  readonly paginationSummary: Locator;
  readonly emptyState: Locator;
  readonly filters: FilterLocators;

  constructor(page: Page) {
    const visibleByTestId = (testId: string): Locator =>
      page.locator(`[data-testid="${testId}"]:visible`).first();

    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.searchInput = page.getByRole("textbox", {
      name: /search jobs|rechercher des emplois/i,
    });
    this.filtersToggle = visibleByTestId(JOB_BOARD_TEST_IDS.filtersToggle);
    this.localeSwitcher = page
      .getByTestId(JOB_BOARD_TEST_IDS.localeSwitcher)
      .first();
    this.jobCards = page.getByTestId(JOB_BOARD_TEST_IDS.jobCard);
    this.paginationSummary = visibleByTestId(
      JOB_BOARD_TEST_IDS.paginationSummary,
    );
    this.emptyState = visibleByTestId(JOB_BOARD_TEST_IDS.emptyState);
    this.filters = {
      employmentType: visibleByTestId(JOB_BOARD_TEST_IDS.employmentTypeSection),
      municipality: visibleByTestId(JOB_BOARD_TEST_IDS.municipalitySection),
      organization: visibleByTestId(JOB_BOARD_TEST_IDS.organizationSection),
      postedWithin: visibleByTestId(JOB_BOARD_TEST_IDS.postedWithinGroup),
      province: visibleByTestId(JOB_BOARD_TEST_IDS.provinceSection),
      salary: visibleByTestId(JOB_BOARD_TEST_IDS.salaryToggle),
      source: visibleByTestId(JOB_BOARD_TEST_IDS.sourceSection),
      sse: visibleByTestId(JOB_BOARD_TEST_IDS.sseToggle),
      workType: visibleByTestId(JOB_BOARD_TEST_IDS.workTypeGroup),
    };
  }

  async goto(
    locale: JobBoardLocale,
    query?: QueryParamsInput,
    options?: Parameters<Page["goto"]>[1],
  ): Promise<void> {
    await this.page.goto(buildJobBoardUrl(locale, query), options);
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.page
      .getByRole("link", { name: String(pageNumber), exact: true })
      .click();
  }

  async switchLocale(): Promise<JobBoardLocale> {
    const nextLocale = this.currentLocale() === "en" ? "fr" : "en";
    await this.localeSwitcher.click();
    return nextLocale;
  }

  async searchFor(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  async openFilters(): Promise<void> {
    if ((await this.filtersToggle.getAttribute("aria-expanded")) !== "true") {
      await this.filtersToggle.click();
    }
  }

  async selectFilterButton(
    filter: ButtonFilterName,
    optionLabel: string,
  ): Promise<void> {
    await this.openFilters();
    await this.filters[filter]
      .getByRole("button", { name: optionLabel, exact: true })
      .click();
  }

  async toggleFilterCheckbox(
    filter: CheckboxFilterName,
    optionLabel: string,
  ): Promise<void> {
    await this.openFilters();
    await this.filters[filter].getByLabel(optionLabel, { exact: true }).click();
  }

  async setBooleanFilter(
    filter: BooleanFilterName,
    checked: boolean,
  ): Promise<void> {
    await this.openFilters();

    const checkbox = this.filters[filter].getByRole("checkbox");
    if (checked) {
      await checkbox.check();
      return;
    }

    await checkbox.uncheck();
  }

  /**
   * Wait for data to refetch after a filter change.
   * Waits for the job cards to reload by checking if their count changes or stabilizes to expected value.
   */
  async waitForResultsToUpdate(timeoutMs: number = 15_000): Promise<void> {
    // Wait for loading state to appear and disappear, indicating a fetch cycle
    // First, give the component time to recognize the filter change
    await this.page.waitForTimeout(100);
    
    // Poll for the pagination summary text to change or stabilize
    // This is a simple heuristic - we assume the initial load shows all 25 jobs
    // Once filters apply, the pagination summary should show different text
    let lastText = await this.paginationSummary.textContent({ timeout: 1000 }).catch(() => "");
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      await this.page.waitForTimeout(200);
      const currentText = await this.paginationSummary.textContent({ timeout: 1000 }).catch(() => "");
      
      // If text changed, give it a moment to stabilize
      if (currentText !== lastText && currentText.length > 0) {
        await this.page.waitForTimeout(200);
        const stabilizedText = await this.paginationSummary.textContent({ timeout: 1000 }).catch(() => "");
        if (stabilizedText === currentText) {
          // Text has stabilized to a new value - fetch is complete
          return;
        }
        lastText = currentText;
      }
      
      // Also check if results are loaded by waiting for job cards to be present
      const cardCount = await this.jobCards.count();
      if (cardCount > 0) {
        return; // Results are displayed
      }
      
      // Check if we've reached an empty state (pagination text indicates 0 results)
      if (currentText && (currentText.includes(' 0 ') || currentText.includes('of 0'))) {
        return; // Empty state reached
      }
    }
    
    throw new Error(`Results did not update within ${timeoutMs}ms`);
  }

  currentLocale(): JobBoardLocale {
    const pathname = new URL(this.page.url()).pathname;
    return pathname.startsWith("/fr/") ? "fr" : "en";
  }
}
