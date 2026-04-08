import { expect, type Locator, type Page } from '@playwright/test';
import { getLocalizedPathname, type AppLocale } from '../../i18n/routing';

function localizedPath(
  locale: AppLocale,
  pathname: '/signup' | '/login' | '/forgot-password' | '/account-settings',
) {
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

  async gotoAccountSettings(locale: AppLocale = 'en'): Promise<void> {
    await this.page.goto(localizedPath(locale, '/account-settings'));
  }

  async submitWhenCaptchaReady(buttonName: RegExp, timeoutMs = 90_000): Promise<void> {
    const submitButton = this.page.getByRole('button', { name: buttonName });
    await expect(submitButton).toBeEnabled({ timeout: timeoutMs });
    await submitButton.click();
  }

  async signup(email: string, password: string): Promise<void> {
    await this.page.getByLabel(/email|courriel/i).fill(email);
    await this.page.getByLabel(/password|mot de passe/i).first().fill(password);
    await this.submitWhenCaptchaReady(/^create account$/i);
  }

  async login(email: string, password: string): Promise<void> {
    await this.page.getByLabel(/email|courriel/i).fill(email);
    await this.page.getByLabel(/^password$|^mot de passe$/i).fill(password);
    await this.submitWhenCaptchaReady(/^log in$/i);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.page.getByLabel(/email|courriel/i).fill(email);
    await this.submitWhenCaptchaReady(/send reset link/i);
  }

  async resetPassword(newPassword: string): Promise<void> {
    await this.page.getByLabel(/new password/i).fill(newPassword);
    await this.page.getByLabel(/confirm password/i).fill(newPassword);
    await this.page.getByRole('button', { name: /update password/i }).click();
  }

  async openDeleteAccountModal(locale: AppLocale = 'en'): Promise<Locator> {
    await this.gotoAccountSettings(locale);
    await this.page.getByRole('button', { name: /^delete account$/i }).first().click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  async requestEmailChange(locale: AppLocale, newEmail: string): Promise<void> {
    await this.gotoAccountSettings(locale);
    await this.page.getByLabel(/new email/i).fill(newEmail);
    await this.page.getByRole('button', { name: /save changes/i }).click();
  }
}
