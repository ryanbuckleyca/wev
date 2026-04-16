import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '../../support/auth-user';
import { deleteAuthUserByEmail } from '../../support/auth-admin';
import { createEphemeralInbox, waitForInboxLink } from '../../support/email';

test.describe('Change password flow @auth-email', () => {
  test.setTimeout(90_000);

  test('logs out after password change and requires new password', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();

    const oldPassword = buildStrongPassword('WevOldPass!');
    const newPassword = buildStrongPassword('WevNewPass!');

    await test.step('Sign up and confirm email', async () => {
      await authPage.gotoSignup('en');
      await authPage.signup(mailbox.emailAddress, oldPassword);
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

      const confirmationLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
      await page.goto(confirmationLink);
      await expect(page).toHaveURL(/\/en(\/)?$/, { timeout: 10_000 });
    });

    await test.step('Change password from account settings', async () => {
      await authPage.gotoAccountSettings('en');
      await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible({
        timeout: 10_000,
      });

      await page.getByLabel(/current password/i).fill(oldPassword);
      await page.getByLabel(/new password/i).fill(newPassword);
      await page.getByLabel(/confirm password/i).fill(newPassword);

      await page.getByRole('button', { name: /^save changes$/i }).click();

      // Successful password updates force a sign-out and redirect home.
      await expect(page).toHaveURL(/\/en(\/)?$/, { timeout: 10_000 });
    });

    await test.step('Confirm user is logged out', async () => {
      await authPage.gotoAccountSettings('en');
      await expect(page).toHaveURL(/\/en\/login(\/)?$/, { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: /^log in$/i })).toBeVisible();
    });

    await test.step('Old password fails; new password succeeds on second attempt', async () => {
      await authPage.gotoLogin('en');
      await authPage.login(mailbox.emailAddress, oldPassword);

      await expect(page.getByText(/invalid login credentials/i)).toBeVisible({ timeout: 10_000 });
      await expect(page).toHaveURL(/\/en\/login(\/)?$/);

      await authPage.login(mailbox.emailAddress, newPassword);
      await expect(page).toHaveURL(/\/en(\/)?$/, { timeout: 10_000 });

      await authPage.gotoAccountSettings('en');
      await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible({
        timeout: 10_000,
      });
    });

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });
});
