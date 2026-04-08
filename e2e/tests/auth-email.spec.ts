import { test, expect } from '../fixtures';
import { buildStrongPassword } from '../support/auth-user';
import { deleteAuthUserByEmail } from '../support/auth-admin';
import {
  expectLoginFailsInFreshContext,
  expectLoginSucceedsInFreshContext,
} from '../support/auth-flow';
import { createEphemeralInbox, waitForInboxLink, type InboxRef } from '../support/mailslurp';
import { getLocalizedPathname } from '../../i18n/routing';

async function waitForLinkWithResendFallback(
  page: import('@playwright/test').Page,
  inboxId: string,
  linkHint: string,
): Promise<string> {
  try {
    return await waitForInboxLink(inboxId, linkHint, 60_000);
  } catch {
    const resendButton = page.getByRole('button', { name: /send another link/i });
    if (await resendButton.isVisible().catch(() => false)) {
      await resendButton.click();
    }
    return waitForInboxLink(inboxId, linkHint, 90_000);
  }
}

test.describe('Auth email flows @auth-email', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const locale = 'en';
  const homePath = /^\/en\/?$/;
  let primaryInbox: InboxRef;
  let secondaryInbox: InboxRef;
  let initialPassword = '';
  let resetPassword = '';
  let confirmationLink = '';
  let resetLink = '';

  test.beforeAll(async () => {
    primaryInbox = await createEphemeralInbox();
    secondaryInbox = await createEphemeralInbox();
    initialPassword = buildStrongPassword('WevInitial!');
    resetPassword = buildStrongPassword('WevReset!');
  });

  test.afterAll(async () => {
    await deleteAuthUserByEmail(primaryInbox.emailAddress);
    await deleteAuthUserByEmail(secondaryInbox.emailAddress);
  });

  test('signup sends confirmation email', async ({ authPage, page }) => {
    await authPage.gotoSignup(locale);
    await authPage.signup(primaryInbox.emailAddress, initialPassword);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    confirmationLink = await waitForLinkWithResendFallback(page, primaryInbox.id, '/auth/callback');
    expect(confirmationLink).toContain('/auth/v1/verify');
  });

  test('confirmation link logs the user in', async ({ page }) => {
    await page.goto(confirmationLink);
    await expect(page).toHaveURL(homePath);
  });

  test('reusing confirmation link goes to auth error page', async ({ page }) => {
    await page.goto(confirmationLink);
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/auth\/auth-code-error$/);
  });

  test('confirmed user can log in', async ({ browser }) => {
    await expectLoginSucceedsInFreshContext(browser, primaryInbox.emailAddress, initialPassword);
  });

  test('unconfirmed user cannot log in', async ({ authPage, browser, page }) => {
    const unconfirmedPassword = buildStrongPassword('WevUnconfirmed!');
    await authPage.gotoSignup(locale);
    await authPage.signup(secondaryInbox.emailAddress, unconfirmedPassword);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await expectLoginFailsInFreshContext(browser, secondaryInbox.emailAddress, unconfirmedPassword);
  });

  test('forgot-password sends reset email and link works once', async ({ authPage, page }) => {
    await authPage.gotoForgotPassword(locale);
    await authPage.requestPasswordReset(primaryInbox.emailAddress);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    resetLink = await waitForLinkWithResendFallback(page, primaryInbox.id, 'reset-password');
    await page.goto(resetLink);
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
    await authPage.resetPassword(resetPassword);
    await expect(page).toHaveURL(homePath);
  });

  test('old password fails and new password succeeds after reset', async ({ browser }) => {
    await expectLoginFailsInFreshContext(browser, primaryInbox.emailAddress, initialPassword);
    await expectLoginSucceedsInFreshContext(browser, primaryInbox.emailAddress, resetPassword);
  });

  test('reusing reset link shows invalid-link UX', async ({ page }) => {
    await page.goto(resetLink);
    await expect(page.getByText(/invalid or expired reset link/i)).toBeVisible();
  });

  test('reset-password page without reset session shows invalid-link UX', async ({ page }) => {
    const resetPath = `/${locale}${getLocalizedPathname('/reset-password', locale)}`;
    await page.goto(resetPath);
    await expect(page.getByText(/invalid or expired reset link/i)).toBeVisible();
  });

  test('delete-account flow surfaces backend errors (no masked fallback)', async ({
    authPage,
    page,
  }) => {
    const dialog = await authPage.openDeleteAccountModal(locale);
    await dialog.getByPlaceholder('Current password').fill(resetPassword);
    await dialog.getByPlaceholder('DELETE').fill('DELETE');
    await dialog.getByRole('button', { name: /^delete account$/i }).last().click();

    await expect(page).toHaveURL(/\/en\/account-settings$/);
    await expect(
      page.getByText(/captcha verification process failed|failed to delete account|internal server error/i),
    ).toBeVisible();
  });
});
