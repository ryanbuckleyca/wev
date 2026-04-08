import { expect, type Locator, type Page } from '@playwright/test';
import { getLocalizedPathname, type AppLocale } from '../../i18n/routing';

function localizedPath(locale: AppLocale, pathname: '/signup' | '/login' | '/forgot-password') {
  return `/${locale}${getLocalizedPathname(pathname, locale)}`;
}

export class AuthPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoSignup(locale: AppLocale = 'en'): Promise<void> {
    await this.page.goto(localizedPath(locale, '/signup'));
  }

  async gotoLogin(locale: AppLocale = 'en'): Promise<void> {
    await this.page.goto(localizedPath(locale, '/login'));
  }

  async gotoForgotPassword(locale: AppLocale = 'en'): Promise<void> {
    await this.page.goto(localizedPath(locale, '/forgot-password'));
  }

  async submitWhenCaptchaReady(buttonName: RegExp, timeoutMs = 90_000): Promise<void> {
    const submitButton = this.page.getByRole('button', { name: buttonName });
    await expect(submitButton).toBeEnabled({ timeout: timeoutMs });
    await submitButton.click();
  }

  async signup(email: string, password: string): Promise<void> {
    await this.page.getByPlaceholder('you@example.com').fill(email);
    await this.page.locator('input[type="password"]').first().fill(password);
    await this.submitWhenCaptchaReady(/^create account$/i);
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.getByPlaceholder('you@example.com').fill(email);
    await this.page.locator('input[type="password"]').first().fill(password);
    await this.submitWhenCaptchaReady(/^log in$/i);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.page.getByPlaceholder('you@example.com').fill(email);
    await this.submitWhenCaptchaReady(/send reset link/i);
  }

  async resetPassword(newPassword: string): Promise<void> {
    const passwordFields = this.page.locator('input[type="password"]');
    await passwordFields.first().fill(newPassword);
    await passwordFields.nth(1).fill(newPassword);
    await this.page.getByRole('button', { name: /update password/i }).click();
  }

  async openDeleteAccountModal(locale: AppLocale = 'en'): Promise<Locator> {
    await this.page.goto(`/${locale}${getLocalizedPathname('/account-settings', locale)}`);
    await this.page.getByRole('button', { name: /^delete account$/i }).first().click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }
}
