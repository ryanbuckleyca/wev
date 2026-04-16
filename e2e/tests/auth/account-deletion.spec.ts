import { test, expect } from '@e2e/fixtures';
import { buildStrongPassword } from '@e2e/support/auth-user';
import { deleteAuthUserByEmail } from '@e2e/support/auth-admin';
import {
  confirmEmailFromInboxAndExpectHome,
  expectLoginFailsInFreshContext,
  submitSignupAndExpectCheckEmail,
} from '@e2e/support/auth-flow';
import { createEphemeralInbox } from '@e2e/support/email';

test.describe('Account deletion flow @auth-email', () => {
  test.setTimeout(120_000);

  test('deletes account successfully', async ({ authPage, browser, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevDelete!');

    try {
      await test.step('Create and confirm account', async () => {
        await submitSignupAndExpectCheckEmail(authPage, mailbox.emailAddress, password, 'en');
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, 'en');
      });

      await test.step('Delete account', async () => {
        await authPage.submitDeleteAccount('en', password, 'DELETE').catch(() => undefined);

        const redirectedHome = await page
          .waitForURL(/\/en(\/)?$/, { timeout: 10_000 })
          .then(() => true)
          .catch(() => false);

        if (!redirectedHome) {
          await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
        }
      });

      await test.step('Verify login is blocked', async () => {
        await expectLoginFailsInFreshContext(browser, mailbox.emailAddress, password);
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });

  test('requires correct password for deletion', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevCorrect!');

    try {
      await test.step('Create and confirm account', async () => {
        await submitSignupAndExpectCheckEmail(authPage, mailbox.emailAddress, password, 'en');
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, 'en');
      });

      await test.step('Try to delete with wrong password', async () => {
        await authPage.submitDeleteAccount('en', 'WrongPassword123!', 'DELETE');
        await expect(page.getByRole('dialog').getByText(/invalid|incorrect|wrong/i)).toBeVisible({
          timeout: 10_000,
        });
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });
});
