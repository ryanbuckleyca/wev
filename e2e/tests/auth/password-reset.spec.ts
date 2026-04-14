import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '../../support/auth-user';
import { deleteAuthUserByEmail } from '../../support/auth-admin';
import { expectLoginFailsInFreshContext, expectLoginSucceedsInFreshContext } from '../../support/auth-flow';
import { createEphemeralInbox, waitForInboxLink } from '../../support/email';

test.describe('Password reset flow @auth-email', () => {
  test.setTimeout(120_000);

  test.fixme('resets password successfully', async ({ authPage, browser, page }) => {
    // FIXME: Disabled due to Gmail SMTP rate limiting in tests
    // Need to either: (1) use local Supabase with Mailpit, or (2) configure proper SMTP service (Resend/SendGrid)
    const mailbox = await createEphemeralInbox();
    const initialPassword = buildStrongPassword('WevInitial!');
    const newPassword = buildStrongPassword('WevReset!');

    await test.step('Create and confirm account', async () => {
      await authPage.gotoSignup('en');
      await authPage.signup(mailbox.emailAddress, initialPassword);
      const confirmLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
      await page.goto(confirmLink);
      await expect(page).toHaveURL(/\/en(\/)?$/);
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

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });

  test('handles invalid reset link gracefully', async ({ page }) => {
    await page.goto('/en/reset-password?token=invalid&type=recovery');
    
    // Should show error or redirect to error page
    await expect(
      page.getByText(/invalid|expired|error/i).or(page.getByRole('heading', { name: /error/i }))
    ).toBeVisible({ timeout: 10_000 });
  });
});
