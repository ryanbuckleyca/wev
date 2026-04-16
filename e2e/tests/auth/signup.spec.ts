import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '../../support/auth-user';
import { deleteAuthUserByEmail } from '../../support/auth-admin';
import { createEphemeralInbox, waitForInboxLink } from '../../support/email';

test.describe('Signup flow @auth-email', () => {
  test.setTimeout(90_000);

  test('creates account and confirms email', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevSignup!');

    await test.step('Submit signup form', async () => {
      await authPage.gotoSignup('en');
      await authPage.signup(mailbox.emailAddress, password);
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    });

    await test.step('Confirm email and auto-login', async () => {
      const confirmationLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
      await page.goto(confirmationLink);
      await expect(page).toHaveURL(/\/en(\/)?$/, { timeout: 10_000 });
    });

    await test.step('Verify user is logged in', async () => {
      await authPage.gotoAccountSettings('en');
      await expect(page.getByRole('heading', { name: /account settings/i })).toBeVisible({
        timeout: 10_000,
      });
    });

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });

  test('does not reveal account existence for duplicate email', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevDupe!');

    // Create first account
    await authPage.gotoSignup('en');
    await authPage.signup(mailbox.emailAddress, password);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    const confirmationLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
    await page.goto(confirmationLink);
    await expect(page).toHaveURL(/\/en(\/)?$/);

    // Sign out
    await page.goto('/auth/signout', { waitUntil: 'networkidle' });

    // Try to sign up again with same email
    await authPage.gotoSignup('en');
    await authPage.signup(mailbox.emailAddress, password);

    // Industry standard: show the same generic "check your email" UX.
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await expect(page.getByText(/if an account exists/i)).toBeVisible();

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });
});
