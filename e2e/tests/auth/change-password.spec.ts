import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '@e2e/support/auth-user';
import { deleteAuthUserByEmail } from '@e2e/support/auth-admin';
import {
  confirmEmailFromInboxAndExpectHome,
  submitSignupAndExpectCheckEmail,
} from '../../support/auth-flow';
import { createEphemeralInbox } from '../../support/email';

test.describe('Change password flow @auth-email', () => {
  test.setTimeout(90_000);

  test('logs out after password change and requires new password', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();

    const oldPassword = buildStrongPassword('WevOldPass!');
    const newPassword = buildStrongPassword('WevNewPass!');

    try {
      await test.step('Sign up and confirm email', async () => {
        await submitSignupAndExpectCheckEmail(authPage, mailbox.emailAddress, oldPassword, 'en');
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, 'en', 90_000);
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
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });
});
