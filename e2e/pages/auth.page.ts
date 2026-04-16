import { expect, type Locator, type Page } from '@playwright/test';
import { getLocalizedPathname, type AppLocale } from '@/i18n/routing';

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

  private async tryCompleteCaptcha(): Promise<void> {
    const iframe = this.page.locator('iframe[src*="turnstile"]').first();
    if (!(await iframe.isVisible().catch(() => false))) return;

    const box = await iframe.boundingBox();
    if (!box) return;

    // Click near the left side of the widget where the checkbox typically appears.
    const clickX = box.x + Math.min(40, box.width / 2);
    const clickY = box.y + box.height / 2;
    await this.page.mouse.click(clickX, clickY);
  }

  async submitWhenCaptchaReady(buttonName: RegExp, timeoutMs = 90_000): Promise<void> {
    const submitButton = this.page.getByRole('button', { name: buttonName });

    await expect
      .poll(
        async () => {
          if (await submitButton.isEnabled().catch(() => false)) return true;
          await this.tryCompleteCaptcha();
          return submitButton.isEnabled().catch(() => false);
        },
        { timeout: timeoutMs },
      )
      .toBe(true);

    await submitButton.click();
  }

  private emailInput() {
    return this.page
      .getByLabel(/email|courriel/i)
      .or(this.page.getByPlaceholder(/you@example\.com/i))
      .first();
  }

  private passwordInput() {
    return this.page
      .getByLabel(/^password$|^mot de passe$/i)
      .or(this.page.getByPlaceholder(/^[-•*]{6,}$/i))
      .first();
  }

  async signup(email: string, password: string): Promise<void> {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitWhenCaptchaReady(/^create account$/i);
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitWhenCaptchaReady(/^log in$/i);
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.emailInput().fill(email);
    await this.submitWhenCaptchaReady(/send reset link/i);
  }

  async resetPassword(newPassword: string): Promise<void> {
    const fields = this.page.getByPlaceholder(/^[-•*]{6,}$/i);
    await expect(fields).toHaveCount(2, { timeout: 10_000 });

    await fields.nth(0).fill(newPassword);
    await fields.nth(1).fill(newPassword);

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
    await this.page.getByPlaceholder(/enter new email/i).fill(newEmail);
    await this.submitWhenCaptchaReady(/save changes/i);
  }

  async submitDeleteAccount(
    locale: AppLocale,
    currentPassword: string,
    confirmationText: 'DELETE' | 'SUPPRIMER' = 'DELETE',
  ): Promise<void> {
    const dialog = await this.openDeleteAccountModal(locale);
    await dialog.getByPlaceholder('Current password').fill(currentPassword);
    await dialog.getByPlaceholder(confirmationText).fill(confirmationText);
    await this.submitWhenCaptchaReady(/^delete account$/i);
  }
}
