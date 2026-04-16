import { test, expect } from '@e2e/fixtures';
import { buildStrongPassword } from '@e2e/support/auth-user';
import { deleteAuthUserByEmail } from '@e2e/support/auth-admin';
import {
  confirmEmailFromInboxAndExpectHome,
  submitSignupAndExpectCheckEmail,
} from '@e2e/support/auth-flow';
import { createEphemeralInbox } from '@e2e/support/email';

test.describe('Signup flow @auth-email', () => {
  test.setTimeout(90_000);

  test('creates account and confirms email', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevSignup!');

    try {
      await test.step('Submit signup form', async () => {
        await submitSignupAndExpectCheckEmail(authPage, mailbox.emailAddress, password, 'en');
      });

      await test.step('Confirm email and auto-login', async () => {
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, 'en');
      });

      await test.step('Verify user is logged in', async () => {
        await authPage.gotoAccountSettings('en');
        await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible({
          timeout: 10_000,
        });
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });

  test('does not reveal account existence for duplicate email', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevDupe!');

    try {
      // Create first account
      await submitSignupAndExpectCheckEmail(authPage, mailbox.emailAddress, password, 'en');
      await confirmEmailFromInboxAndExpectHome(authPage, mailbox, 'en');

      // Sign out
      await page.goto('/auth/signout', { waitUntil: 'networkidle' });

      // Try to sign up again with same email
      await submitSignupAndExpectCheckEmail(authPage, mailbox.emailAddress, password, 'en');

      // Industry standard: show the same generic "check your email" UX.
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
      await expect(page.getByText(/if an account exists/i)).toBeVisible();
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });
});
