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

async function confirmEmailWithRetry(
  page: import('@playwright/test').Page,
  inboxId: string,
  initialLink: string,
): Promise<string> {
  let link = initialLink;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(link);
    const pathname = new URL(page.url()).pathname;
    if (/^\/en\/?$/.test(pathname)) {
      return link;
    }

    if (pathname === '/auth/auth-code-error' && attempt === 0) {
      const backToLogin = page.getByRole('link', { name: /back to login/i });
      if (await backToLogin.isVisible().catch(() => false)) {
        await backToLogin.click();
      }
      link = await waitForInboxLink(inboxId, '/auth/callback', 90_000);
      continue;
    }

    throw new Error(`Email confirmation failed at path: ${pathname}`);
  }

  throw new Error('Email confirmation failed after retrying with a fresh link.');
}

async function cleanupAuthUsers(emails: string[]): Promise<void> {
  const unique = [...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const results = await Promise.allSettled(unique.map((email) => deleteAuthUserByEmail(email)));
  const failures = results
    .map((result, index) => ({ email: unique[index], result }))
    .filter((entry): entry is { email: string; result: PromiseRejectedResult } => {
      return entry.result.status === 'rejected';
    });

  if (failures.length > 0) {
    const failedEmails = failures.map((entry) => entry.email).join(', ');
    console.warn(`Auth e2e cleanup skipped for: ${failedEmails}`);
  }
}

test.describe('Auth email flows @auth-email', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const locale = 'en';
  const homePath = /^\/en\/?$/;
  let primaryInbox: InboxRef;
  let secondaryInbox: InboxRef;
  let emailChangeInbox: InboxRef;
  let initialPassword = '';
  let resetPassword = '';
  let currentEmailAddress = '';
  let confirmationLink = '';
  let emailChangeLink = '';
  let resetLink = '';

  test.beforeAll(async () => {
    primaryInbox = await createEphemeralInbox();
    secondaryInbox = await createEphemeralInbox();
    emailChangeInbox = await createEphemeralInbox();
    await cleanupAuthUsers([
      primaryInbox.emailAddress,
      secondaryInbox.emailAddress,
      emailChangeInbox.emailAddress,
    ]);
    initialPassword = buildStrongPassword('WevInitial!');
    resetPassword = buildStrongPassword('WevReset!');
    currentEmailAddress = primaryInbox.emailAddress;
  });

  test.afterAll(async () => {
    await cleanupAuthUsers(
      [
        primaryInbox?.emailAddress,
        secondaryInbox?.emailAddress,
        emailChangeInbox?.emailAddress,
        currentEmailAddress,
      ].filter((value): value is string => Boolean(value)),
    );
  });

  test('signup sends confirmation email', async ({ authPage, page }) => {
    await authPage.gotoSignup(locale);
    await authPage.signup(primaryInbox.emailAddress, initialPassword);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    confirmationLink = await waitForLinkWithResendFallback(page, primaryInbox.id, '/auth/callback');
    expect(confirmationLink).toContain('/auth/v1/verify');
  });

  test('confirmation link logs the user in', async ({ page }) => {
    confirmationLink = await confirmEmailWithRetry(page, primaryInbox.id, confirmationLink);
    await expect(page).toHaveURL(homePath);
  });

  test('reusing confirmation link goes to auth error page', async ({ page }) => {
    await page.goto(confirmationLink);
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toMatch(/^\/auth\/auth-code-error$/);
  });

  test('confirmed user can log in', async ({ browser }) => {
    await expectLoginSucceedsInFreshContext(browser, currentEmailAddress, initialPassword);
  });

  test('account settings email change sends confirmation email', async ({
    authPage,
    browser,
    page,
  }) => {
    const previousEmail = currentEmailAddress;
    await authPage.requestEmailChange(locale, emailChangeInbox.emailAddress);
    await expect(page.getByText(/confirmation email sent to your new address/i)).toBeVisible();
    emailChangeLink = await waitForLinkWithResendFallback(page, emailChangeInbox.id, '/auth/callback');
    currentEmailAddress = emailChangeInbox.emailAddress;

    await expectLoginFailsInFreshContext(browser, previousEmail, initialPassword);
  });

  test('email-change confirmation applies the new login email', async ({ browser, page }) => {
    await page.goto(emailChangeLink);
    await expect(page).toHaveURL(homePath);
    await expectLoginSucceedsInFreshContext(browser, currentEmailAddress, initialPassword);
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
    await authPage.requestPasswordReset(currentEmailAddress);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    resetLink = await waitForLinkWithResendFallback(page, emailChangeInbox.id, 'reset-password');
    await page.goto(resetLink);
    await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
    await authPage.resetPassword(resetPassword);
    await expect(page).toHaveURL(homePath);
  });

  test('old password fails and new password succeeds after reset', async ({ browser }) => {
    await expectLoginFailsInFreshContext(browser, currentEmailAddress, initialPassword);
    await expectLoginSucceedsInFreshContext(browser, currentEmailAddress, resetPassword);
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

  test('delete-account should delete user and block future login', async ({
    authPage,
    browser,
    page,
  }) => {
    await authPage.submitDeleteAccount(locale, resetPassword, 'DELETE');

    await expect(page).toHaveURL(homePath);
    await expectLoginFailsInFreshContext(browser, currentEmailAddress, resetPassword);
  });
});
