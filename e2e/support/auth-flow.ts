import { expect, type Browser } from '@playwright/test';
import type { AppLocale } from '@/i18n/routing';
import { AuthPage } from '../pages/auth.page';
import { waitForInboxLink, type InboxRef } from './email';

export async function submitSignupAndExpectCheckEmail(
  authPage: AuthPage,
  email: string,
  password: string,
  locale: AppLocale = 'en',
): Promise<void> {
  const page = authPage.page;
  await authPage.gotoSignup(locale);
  await authPage.signup(email, password);
  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible({
    timeout: 10_000,
  });
}

export async function confirmEmailFromInboxAndExpectHome(
  authPage: AuthPage,
  inbox: InboxRef,
  locale: AppLocale = 'en',
  timeoutMs = 90_000,
): Promise<void> {
  const page = authPage.page;
  const confirmationLink = await waitForInboxLink(inbox.id, '/auth/callback', timeoutMs);
  await page.goto(confirmationLink);
  await expect(page).toHaveURL(new RegExp(`/${locale}(\\/)?$`), { timeout: 10_000 });
}

export async function expectLoginFailsInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const authPage = new AuthPage(page);
    await authPage.gotoLogin('en');
    await authPage.login(email, password);

    await expect(
      page.getByText(/invalid login credentials|email not confirmed|user not found/i),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
}

export async function expectLoginSucceedsInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const authPage = new AuthPage(page);
    await authPage.gotoLogin('en');
    await authPage.login(email, password);
    await expect(page).toHaveURL(/\/en(\/)?$/);
  } finally {
    await context.close();
  }
}
