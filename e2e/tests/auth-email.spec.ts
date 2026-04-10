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
import { getEmailProvider, type InboxRef } from '../support/email-provider';
import { getLocalizedPathname } from '../../i18n/routing';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { Page } from '@playwright/test';

// ─── Constants ────────────────────────────────────────────────────────────

const EMAIL_WAIT_TIMEOUT = 30_000; // 30 seconds
const EMAIL_CHANGE_DUAL_CONFIRM_TIMEOUT = 60_000; // 60 seconds
const DEBUG = process.env.E2E_DEBUG === 'true';

// ─── Helpers ──────────────────────────────────────────────────────────────

const emailProvider = getEmailProvider();

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[E2E DEBUG]', ...args);
  }
}

async function waitForLinkWithResendFallback(
  page: Page,
  inboxId: string,
  linkHint: string,
  since?: Date,
): Promise<string> {
  try {
    return await emailProvider.waitForEmail(inboxId, linkHint, EMAIL_WAIT_TIMEOUT, since);
  } catch {
    const resendButton = page.getByRole('button', { name: /send another link/i });
    if (await resendButton.isVisible().catch(() => false)) {
      await resendButton.click();
    }
    return emailProvider.waitForEmail(inboxId, linkHint, EMAIL_WAIT_TIMEOUT, since);
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
  test.setTimeout(90_000); // 90 seconds max

  const locale = 'en';
  const homePath = /\/en\/?$/;

  let primaryInbox: InboxRef;
  let secondaryInbox: InboxRef;
  let emailChangeInbox: InboxRef;
  let initialPassword = '';
  let resetPassword = '';
  let currentEmailAddress = '';
  let usedConfirmationLink = '';
  let emailChangedAt: Date | undefined;
  let resetLink = '';
  let testStartTime: Date;

  // Persisted session written by test 1, read by tests 2+
  const sessionFile = path.join(os.tmpdir(), 'wev-e2e-auth-session.json');

  test.beforeAll(async () => {
    testStartTime = new Date();
    
    // Remove any stale session file from a previous run
    fs.rmSync(sessionFile, { force: true });

    // Sequential to avoid race on pooledInboxIndex
    primaryInbox = await emailProvider.createInbox();
    secondaryInbox = await emailProvider.createInbox();
    emailChangeInbox = await emailProvider.createInbox();
    
    debugLog('Created inboxes:', {
      primary: primaryInbox.emailAddress,
      secondary: secondaryInbox.emailAddress,
      emailChange: emailChangeInbox.emailAddress,
    });
    
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
    const inboxes = [primaryInbox, secondaryInbox, emailChangeInbox];
    await cleanupAuthUsers(
      inboxes
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
      testStartTime,
    );
    expect(confirmationLink).toContain('/auth/v1/verify');
    debugLog('Got signup confirmation link:', confirmationLink);

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
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      const { AuthPage } = await import('../pages/auth.page');
      const authPage = new AuthPage(page);
      
      await authPage.gotoLogin('en');
      await authPage.login(currentEmailAddress, initialPassword);
      await expect(page).toHaveURL(/\/en(\/)?$/);
      
      // Update session file with fresh login
      await ctx.storageState({ path: sessionFile });
      debugLog('Updated session file after successful login');
    } finally {
      await ctx.close();
    }
  });

  // ── 4. Email change ───────────────────────────────────────────────────────
  // Combined test: request email change and confirm it in the same context
  // to preserve PKCE code verifier
  test('account settings email change and confirmation', async ({ browser }) => {
    // Use the saved session from test 3
    const ctx = await browser.newContext({ storageState: sessionFile });
    
    // CRITICAL: Supabase SSR stores session in localStorage, but Playwright's storageState
    // only restores cookies. We need to manually inject localStorage from the cookies.
    // The session is stored in chunked cookies with base64 encoding
    await ctx.addInitScript(() => {
      const cookies = document.cookie.split(';').map(c => c.trim());
      const authCookies = cookies
        .filter(c => c.startsWith('sb-') && c.includes('-auth-token'))
        .sort(); // Ensure correct order (.0, .1, .2, etc)
      
      if (authCookies.length > 0) {
        // Reconstruct the full session from chunked cookies
        const fullValue = authCookies
          .map(c => {
            const [, value] = c.split('=');
            // Remove 'base64-' prefix if present
            return value.startsWith('base64-') ? value.substring(7) : value;
          })
          .join('');
        
        // Extract project ref from first cookie name
        const firstCookie = authCookies[0];
        const match = firstCookie.match(/sb-([^-]+)-auth-token/);
        if (match) {
          const projectRef = match[1];
          const key = `sb-${projectRef}-auth-token`;
          // Decode from base64 and store in localStorage
          try {
            const decoded = atob(fullValue);
            localStorage.setItem(key, decoded);
          } catch {
            // If decode fails, store as-is
            localStorage.setItem(key, fullValue);
          }
        }
      }
    });
    
    const page = await ctx.newPage();
    
    try {
      const { AuthPage } = await import('../pages/auth.page');
      const ap = new AuthPage(page);

      debugLog('Email change - from:', currentEmailAddress, 'to:', emailChangeInbox.emailAddress);

      // Go directly to home page first to verify session works
      debugLog('Testing saved session by navigating to home...');
      await page.goto(`http://localhost:3000/en`);
      await expect(page).toHaveURL(homePath);
      debugLog('Home page loaded with saved session');
      
      // Now try account settings
      debugLog('Navigating to account settings with saved session...');
      await ap.gotoAccountSettings(locale);
      
      // Debug: Check what cookies and localStorage are present
      const cookies = await page.context().cookies();
      const authCookies = cookies.filter(c => c.name.includes('auth-token'));
      debugLog('Auth cookies present:', authCookies.length);
      
      const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
      debugLog('LocalStorage keys:', localStorageKeys);
      
      await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible({ timeout: 10000 });
      debugLog('Account settings page loaded');
      
      // Fill new email
      debugLog('Filling new email...');
      const emailInput = page.getByPlaceholder(/enter new email/i);
      await emailInput.clear();
      await emailInput.fill(emailChangeInbox.emailAddress);
      
      // Wait for button to be enabled (form state should update)
      debugLog('Waiting for save button to be enabled...');
      const saveButton = page.getByRole('button', { name: /save changes/i });
      await expect(saveButton).toBeEnabled({ timeout: 5000 });
      
      debugLog('Clicking save changes...');
      await saveButton.click();
      
      debugLog('Waiting for confirmation message...');
      await expect(page.getByText(/confirmation email sent to your new address/i)).toBeVisible();
      emailChangedAt = new Date();
      debugLog('Confirmation message visible');

      // Fetch confirmation link for NEW email
      debugLog('Waiting for new email confirmation in inbox:', emailChangeInbox.id);
      const emailChangeLink = await waitForLinkWithResendFallback(
        page,
        emailChangeInbox.id,
        '/auth/callback',
        emailChangedAt,
      );
      debugLog('Got new email confirmation link:', emailChangeLink);

      // Visit new email confirmation link
      await page.goto(emailChangeLink);

      // Check if we need to also confirm from old email
      // Supabase may require dual confirmation for security
      const currentUrl = page.url();
      debugLog('After new email confirmation, URL:', currentUrl);
      
      if (currentUrl.includes('auth-code-error')) {
        debugLog('Need dual confirmation - fetching old email link');
        // Fetch and confirm from old email too
        const oldEmailLink = await emailProvider.waitForEmail(
          primaryInbox.id,
          '/auth/callback',
          EMAIL_CHANGE_DUAL_CONFIRM_TIMEOUT,
          emailChangedAt,
        );
        debugLog('Got old email confirmation link:', oldEmailLink);
        await page.goto(oldEmailLink);
      }

      // Should now be redirected to home
      await expect(page).toHaveURL(homePath, { timeout: 10000 });

      // Update current email AFTER successful confirmation
      currentEmailAddress = emailChangeInbox.emailAddress;
      debugLog('Email change complete - new email:', currentEmailAddress);

      // Update the session file with the new authenticated state
      await page.context().storageState({ path: sessionFile });

      // Verify old email no longer works
      await expectLoginFailsInFreshContext(browser, primaryInbox.emailAddress, initialPassword);

      // Verify new email works
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

      // After email change, currentEmailAddress === emailChangeInbox.emailAddress
      expect(currentEmailAddress).toBe(emailChangeInbox.emailAddress);
      debugLog('Requesting password reset for:', currentEmailAddress);

      await ap.gotoForgotPassword(locale);
      await ap.requestPasswordReset(currentEmailAddress);
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

      // Wait for password reset email in the current inbox
      const resetEmailSentAt = new Date();
      resetLink = await emailProvider.waitForEmail(
        emailChangeInbox.id,
        'reset-password',
        EMAIL_WAIT_TIMEOUT,
        resetEmailSentAt,
      );
      debugLog('Got password reset link:', resetLink);
      
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
