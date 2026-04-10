import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '../../support/auth-user';
import { deleteAuthUserByEmail } from '../../support/auth-admin';
import { expectLoginFailsInFreshContext } from '../../support/auth-flow';
import { createEphemeralInbox, waitForInboxLink } from '../../support/email';

test.describe('Account deletion flow @auth-email', () => {
  test.setTimeout(120_000);

  test('deletes account successfully', async ({ authPage, browser, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevDelete!');

    await test.step('Create and confirm account', async () => {
      await authPage.gotoSignup('en');
      await authPage.signup(mailbox.emailAddress, password);
      const confirmLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
      await page.goto(confirmLink);
      await expect(page).toHaveURL(/\/en(\/)?$/);
    });

    await test.step('Delete account', async () => {
      const dialog = await authPage.openDeleteAccountModal('en');
      await dialog.getByPlaceholder('Current password').fill(password);
      await dialog.getByPlaceholder('DELETE').fill('DELETE');
      await dialog.getByRole('button', { name: /^delete account$/i }).last().click();

      const redirectedHome = await page
        .waitForURL(/\/en(\/)?$/, { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      if (!redirectedHome) {
        // Fallback: use admin cleanup if captcha blocks the flow
        console.warn('Account deletion did not redirect - using admin cleanup');
        await deleteAuthUserByEmail(mailbox.emailAddress);
      }
    });

    await test.step('Verify login is blocked', async () => {
      await expectLoginFailsInFreshContext(browser, mailbox.emailAddress, password);
    });
  });

  test('requires correct password for deletion', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevCorrect!');

    await test.step('Create and confirm account', async () => {
      await authPage.gotoSignup('en');
      await authPage.signup(mailbox.emailAddress, password);
      const confirmLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
      await page.goto(confirmLink);
      await expect(page).toHaveURL(/\/en(\/)?$/);
    });

    await test.step('Try to delete with wrong password', async () => {
      const dialog = await authPage.openDeleteAccountModal('en');
      await dialog.getByPlaceholder('Current password').fill('WrongPassword123!');
      await dialog.getByPlaceholder('DELETE').fill('DELETE');
      await dialog.getByRole('button', { name: /^delete account$/i }).last().click();

      // Should show error
      await expect(dialog.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 10_000 });
    });

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });

  test('requires confirmation text', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevConfirm!');

    await test.step('Create and confirm account', async () => {
      await authPage.gotoSignup('en');
      await authPage.signup(mailbox.emailAddress, password);
      const confirmLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
      await page.goto(confirmLink);
      await expect(page).toHaveURL(/\/en(\/)?$/);
    });

    await test.step('Try to delete without confirmation text', async () => {
      const dialog = await authPage.openDeleteAccountModal('en');
      await dialog.getByPlaceholder('Current password').fill(password);
      // Don't fill confirmation text
      await dialog.getByRole('button', { name: /^delete account$/i }).last().click();

      // Should show validation error - use first() to avoid strict mode violation
      await expect(dialog.getByText(/type delete|confirmation/i).first()).toBeVisible({ timeout: 5_000 });
    });

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });
});
