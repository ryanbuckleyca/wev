import { test, expect } from '../fixtures';
import { buildStrongPassword, buildUniqueMailinatorAddress } from '../support/auth-user';
import {
  expectLoginFailsInFreshContext,
  expectLoginSucceedsInFreshContext,
} from '../support/auth-flow';
import { waitForMailinatorPublicLink } from '../support/mailinator-public';

test.describe('Auth email flows @auth-email', () => {
  test.describe.configure({ mode: 'serial' });

  test('signup, confirm email, login, reset password, and delete account', async ({
    authPage,
    browser,
    page,
  }) => {
    const mailbox = buildUniqueMailinatorAddress();
    const initialPassword = buildStrongPassword('WevInitial!');
    const resetPassword = buildStrongPassword('WevReset!');

    await test.step('Create account from signup page', async () => {
      await authPage.gotoSignup('en');
      await authPage.signup(mailbox.email, initialPassword);
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    });

    await test.step('Confirm email from Mailinator link and auto-login', async () => {
      const mailinatorPage = await browser.newPage();
      const confirmationLink = await waitForMailinatorPublicLink(mailinatorPage, {
        inbox: mailbox.inbox,
        linkHint: '/auth/callback',
      });
      await mailinatorPage.close();

      await page.goto(confirmationLink);
      await expect(page).toHaveURL(/\/en(\/)?$/);
    });

    await test.step('Request password reset and set a new password', async () => {
      await authPage.gotoForgotPassword('en');
      await authPage.requestPasswordReset(mailbox.email);
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

      const mailinatorPage = await browser.newPage();
      const resetLink = await waitForMailinatorPublicLink(mailinatorPage, {
        inbox: mailbox.inbox,
        linkHint: 'reset-password',
      });
      await mailinatorPage.close();

      await page.goto(resetLink);
      await expect(page.getByRole('heading', { name: /reset password/i })).toBeVisible();
      await authPage.resetPassword(resetPassword);

      // Current product behavior auto-logs in after reset.
      await expect(page).toHaveURL(/\/en(\/)?$/);
    });

    await test.step('Old password fails, new password succeeds', async () => {
      await expectLoginFailsInFreshContext(browser, mailbox.email, initialPassword);
      await expectLoginSucceedsInFreshContext(browser, mailbox.email, resetPassword);
    });

    await test.step('Delete account and confirm login is blocked', async () => {
      const dialog = await authPage.openDeleteAccountModal('en');
      await dialog.getByPlaceholder('Current password').fill(resetPassword);
      await dialog.getByPlaceholder('DELETE').fill('DELETE');
      await dialog.getByRole('button', { name: /^delete account$/i }).last().click();

      await expect(page).toHaveURL(/\/en(\/)?$/);

      await expectLoginFailsInFreshContext(browser, mailbox.email, resetPassword);
    });
  });
});
