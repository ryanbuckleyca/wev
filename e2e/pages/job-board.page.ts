import { expect, type Locator, type Page } from '@playwright/test';

export type JobBoardLocale = 'en' | 'fr';

const jobBoardPathByLocale: Record<JobBoardLocale, string> = {
  en: '/en/jobs',
  fr: '/fr/emplois',
};

const headingByLocale: Record<JobBoardLocale, string> = {
  en: 'Bulletin – Job Postings',
  fr: "Bulletin – Offres d'emploi",
};

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class JobBoardPage {
  readonly page: Page;
  readonly mainHeading: Locator;
  readonly searchInput: Locator;
  readonly localeSwitcher: Locator;
  readonly jobCardList: Locator;
  readonly jobCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mainHeading = page.getByRole('heading', { level: 1 });
    this.searchInput = page.getByRole('textbox', {
      name: /search jobs|rechercher des emplois/i,
    });
    this.localeSwitcher = page.getByRole('button', {
      name: /toggle language|changer de langue/i,
    });
    this.jobCardList = page.getByTestId('job-card-list');
    this.jobCards = page.getByTestId('job-card');
  }

  async gotoEnglishJobs(): Promise<void> {
    await this.goto('en');
  }

  async gotoFrenchJobs(): Promise<void> {
    await this.goto('fr');
  }

  async goto(locale: JobBoardLocale): Promise<void> {
    await this.page.goto(jobBoardPathByLocale[locale]);
  }

  async expectLoaded(locale: JobBoardLocale): Promise<void> {
    await expect(this.page).toHaveURL(
      new RegExp(`${escapeForRegex(jobBoardPathByLocale[locale])}(?:\\?.*)?$`),
    );
    await expect(this.page.locator('html')).toHaveAttribute('lang', locale);
    await expect(this.mainHeading).toHaveText(headingByLocale[locale]);
    await expect(this.searchInput).toBeVisible();
    await expect(this.localeSwitcher).toBeVisible();
  }

  async expectJobCardsVisible(): Promise<void> {
    await expect(this.jobCardList).toBeVisible();
    await expect.poll(async () => this.jobCards.count()).toBeGreaterThan(0);
    await expect(this.jobCards.first()).toBeVisible();
  }

  async switchLocale(): Promise<JobBoardLocale> {
    const currentLocale = this.currentLocale();
    const nextLocale = currentLocale === 'en' ? 'fr' : 'en';

    await this.localeSwitcher.click();
    await this.expectLoaded(nextLocale);

    return nextLocale;
  }

  currentLocale(): JobBoardLocale {
    const pathname = new URL(this.page.url()).pathname;
    return pathname.startsWith('/fr/') ? 'fr' : 'en';
  }
}
