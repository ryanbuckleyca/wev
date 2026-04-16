import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '../../support/auth-user';
import { deleteAuthUserByEmail } from '../../support/auth-admin';
import {
  confirmEmailFromInboxAndExpectHome,
  expectLoginFailsInFreshContext,
  expectLoginSucceedsInFreshContext,
  submitSignupAndExpectCheckEmail,
} from '../../support/auth-flow';
import { createEphemeralInbox, waitForInboxLink } from '../../support/email';

test.describe('Password reset flow @auth-email', () => {
  test.setTimeout(120_000);

  test('resets password successfully', async ({ authPage, browser, page }) => {
    const mailbox = await createEphemeralInbox();
    const initialPassword = buildStrongPassword('WevInitial!');
    const newPassword = buildStrongPassword('WevReset!');

    try {
      await test.step('Create and confirm account', async () => {
        await submitSignupAndExpectCheckEmail(authPage, mailbox.emailAddress, initialPassword, 'en');
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, 'en', 90_000);
      });

      await test.step('Request password reset', async () => {
        await authPage.gotoForgotPassword('en');
        await authPage.requestPasswordReset(mailbox.emailAddress);
        await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
      });

      await test.step('Set new password', async () => {
        const resetLink = await waitForInboxLink(mailbox.id, 'reset-password', 90_000);
        await page.goto(resetLink);
        await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
        await authPage.resetPassword(newPassword);
        await expect(page).toHaveURL(/\/en(\/)?$/, { timeout: 10_000 });
      });

      await test.step('Verify old password fails', async () => {
        await expectLoginFailsInFreshContext(browser, mailbox.emailAddress, initialPassword);
      });

      await test.step('Verify new password works', async () => {
        await expectLoginSucceedsInFreshContext(browser, mailbox.emailAddress, newPassword);
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });

  test('handles invalid reset link gracefully', async ({ page }) => {
    await page.goto('/en/reset-password?token=invalid&type=recovery');
    
    // Should show error or redirect to error page
    await expect(
      page.getByText(/invalid|expired|error/i).or(page.getByRole('heading', { name: /error/i }))
    ).toBeVisible({ timeout: 10_000 });
  });
});
