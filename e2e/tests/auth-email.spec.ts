/**
 * Auth email E2E — serial user journey
 *
 * These tests cover a real end-to-end auth flow: signup → confirm → change
 * email → reset password → delete account. Because each step depends on the
 * previous one (e.g. you need a confirmed account before you can change its
 * email), the suite is intentionally serial and shares state across steps.
 *
 * Individual tests are NOT designed to run in isolation — run the full suite
 * with `npm run test:e2e:auth-email`.
 *
 * PKCE note: Supabase's PKCE flow stores a code-verifier in the browser
 * session that initiated the signup. Signup and email-confirmation therefore
 * run in the same `page` fixture. After confirmation we save `storageState`
 * so every subsequent test can restore the authenticated session in a fresh
 * context without needing the original PKCE verifier.
 */

import { test, expect } from '../fixtures';
import { buildStrongPassword } from '../support/auth-user';
import { deleteAuthUserByEmail } from '../support/auth-admin';
import {
  expectLoginFailsInFreshContext,
  expectLoginSucceedsInFreshContext,
} from '../support/auth-flow';
import { createEphemeralInbox, waitForInboxLink, type InboxRef } from '../support/mailslurp';
import { getLocalizedPathname } from '../../i18n/routing';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { Page } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────

async function waitForLinkWithResendFallback(
  page: Page,
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

async function cleanupAuthUsers(emails: string[]): Promise<void> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const results = await Promise.allSettled(unique.map((e) => deleteAuthUserByEmail(e)));
  const failed = results
    .map((r, i) => ({ email: unique[i], r }))
    .filter((x): x is { email: string; r: PromiseRejectedResult } => x.r.status === 'rejected');
  if (failed.length > 0) {
    console.warn(`Auth e2e cleanup skipped for: ${failed.map((x) => x.email).join(', ')}`);
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────

test.describe('Auth email flows @auth-email', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  const locale = 'en';
  const homePath = /\/en\/?$/;

  let primaryInbox: InboxRef;
  let secondaryInbox: InboxRef;
  let emailChangeInbox: InboxRef;
  let initialPassword = '';
  let resetPassword = '';
  let currentEmailAddress = '';
  let usedConfirmationLink = '';
  let emailChangeLink = '';
  let emailChangedAt: Date | undefined;
  let resetLink = '';

  // Persisted session written by test 1, read by tests 2+
  const sessionFile = path.join(os.tmpdir(), 'wev-e2e-auth-session.json');

  test.beforeAll(async () => {
    // Remove any stale session file from a previous run
    fs.rmSync(sessionFile, { force: true });

    // Sequential to avoid race on pooledInboxIndex
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
      [primaryInbox, secondaryInbox, emailChangeInbox]
        .map((i) => i?.emailAddress)
        .concat(currentEmailAddress)
        .filter((e): e is string => Boolean(e)),
    );
  });

  // ── 1. Signup + confirm ───────────────────────────────────────────────────
  // Signup and confirmation must share the same page so the PKCE code-verifier
  // set during signup is still present when the confirmation link is visited.
  // After a successful confirmation we save storageState for later tests.
  test('signup and email confirmation', async ({ page }) => {
    const { AuthPage } = await import('../pages/auth.page');
    const ap = new AuthPage(page);

    // Sign up
    await ap.gotoSignup(locale);
    await ap.signup(primaryInbox.emailAddress, initialPassword);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    // Fetch confirmation link from inbox
    const confirmationLink = await waitForLinkWithResendFallback(
      page,
      primaryInbox.id,
      '/auth/callback',
    );
    expect(confirmationLink).toContain('/auth/v1/verify');

    // Visit the link — PKCE verifier is still in this page's session
    await page.goto(confirmationLink);
    await expect(page).toHaveURL(homePath);

    // Save session so subsequent tests can restore it without PKCE
    await page.context().storageState({ path: sessionFile });
    usedConfirmationLink = confirmationLink;
  });

  // ── 2. Reusing the confirmation link fails ────────────────────────────────
  test('reusing confirmation link goes to auth error page', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: sessionFile });
    const page = await ctx.newPage();
    try {
      await page.goto(usedConfirmationLink);
      await expect
        .poll(() => new URL(page.url()).pathname)
        .toMatch(/^\/auth\/auth-code-error$/);
    } finally {
      await ctx.close();
    }
  });

  // ── 3. Confirmed user can log in ──────────────────────────────────────────
  test('confirmed user can log in', async ({ browser }) => {
    await expectLoginSucceedsInFreshContext(browser, currentEmailAddress, initialPassword);
  });

  // ── 4. Email change ───────────────────────────────────────────────────────
  // Combined test: request email change and confirm it in the same context
  // to preserve PKCE code verifier
  test('account settings email change and confirmation', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: sessionFile });
    const page = await ctx.newPage();
    try {
      const { AuthPage } = await import('../pages/auth.page');
      const ap = new AuthPage(page);

      // Request email change
      await ap.requestEmailChange(locale, emailChangeInbox.emailAddress);
      await expect(page.getByText(/confirmation email sent to your new address/i)).toBeVisible();
      emailChangedAt = new Date();

      emailChangeLink = await waitForLinkWithResendFallback(
        page,
        emailChangeInbox.id,
        '/auth/callback',
      );
      currentEmailAddress = emailChangeInbox.emailAddress;

      // Confirm from the new email address in the same context
      await page.goto(emailChangeLink);

      // If Supabase requires old-email confirmation too, fetch and visit it
      const currentUrl = page.url();
      if (currentUrl.includes('auth-code-error') || currentUrl.includes('Confirmation+link+accepted')) {
        // Use emailChangedAt as since to avoid picking up the old signup link
        const oldEmailLink = await waitForInboxLink(primaryInbox.id, '/auth/callback', 60_000, emailChangedAt);
        await page.goto(oldEmailLink);
      }

      await expect(page).toHaveURL(homePath);
      
      // Update the session file with the new authenticated state
      await page.context().storageState({ path: sessionFile });
      
      await expectLoginSucceedsInFreshContext(browser, currentEmailAddress, initialPassword);
    } finally {
      await ctx.close();
    }
  });

  // ── 6. Unconfirmed user cannot log in ─────────────────────────────────────
  test('unconfirmed user cannot log in', async ({ page, browser }) => {
    const { AuthPage } = await import('../pages/auth.page');
    const ap = new AuthPage(page);
    const unconfirmedPassword = buildStrongPassword('WevUnconfirmed!');

    await ap.gotoSignup(locale);
    await ap.signup(secondaryInbox.emailAddress, unconfirmedPassword);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await expectLoginFailsInFreshContext(browser, secondaryInbox.emailAddress, unconfirmedPassword);
  });

  // ── 7. Password reset ─────────────────────────────────────────────────────
  test('forgot-password sends reset email and link works once', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: sessionFile });
    const page = await ctx.newPage();
    try {
      const { AuthPage } = await import('../pages/auth.page');
      const ap = new AuthPage(page);

      await ap.gotoForgotPassword(locale);
      await ap.requestPasswordReset(currentEmailAddress);
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

      resetLink = await waitForLinkWithResendFallback(
        page,
        emailChangeInbox.id,
        'reset-password',
      );
      await page.goto(resetLink);
      await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
      await ap.resetPassword(resetPassword);
      await expect(page).toHaveURL(homePath);
    } finally {
      await ctx.close();
    }
  });

  // ── 8. Old password fails, new succeeds ───────────────────────────────────
  test('old password fails and new password succeeds after reset', async ({ browser }) => {
    await expectLoginFailsInFreshContext(browser, currentEmailAddress, initialPassword);
    await expectLoginSucceedsInFreshContext(browser, currentEmailAddress, resetPassword);
  });

  // ── 9. Reset link reuse ───────────────────────────────────────────────────
  test('reusing reset link shows invalid-link UX', async ({ page }) => {
    await page.goto(resetLink);
    await expect(page.getByText(/invalid or expired reset link/i)).toBeVisible();
  });

  // ── 10. Reset page without session ───────────────────────────────────────
  test('reset-password page without reset session shows invalid-link UX', async ({ page }) => {
    const resetPath = `/${locale}${getLocalizedPathname('/reset-password', locale)}`;
    await page.goto(resetPath);
    await expect(page.getByText(/invalid or expired reset link/i)).toBeVisible();
  });

  // ── 11. Delete account ────────────────────────────────────────────────────
  test('delete-account should delete user and block future login', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: sessionFile });
    const page = await ctx.newPage();
    try {
      const { AuthPage } = await import('../pages/auth.page');
      const ap = new AuthPage(page);

      await ap.submitDeleteAccount(locale, resetPassword, 'DELETE');
      await expect(page).toHaveURL(homePath);
      await expectLoginFailsInFreshContext(browser, currentEmailAddress, resetPassword);
    } finally {
      await ctx.close();
    }
  });
});
