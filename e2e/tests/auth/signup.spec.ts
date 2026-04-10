import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '../../support/auth-user';
import { deleteAuthUserByEmail } from '../../support/auth-admin';
import { createEphemeralInbox, waitForInboxLink } from '../../support/email';

test.describe('Signup flow @auth-email', () => {
  test.setTimeout(90_000);

  test.fixme('creates account and confirms email', async ({ authPage, page }) => {
    // FIXME: Disabled due to Gmail SMTP rate limiting in tests
    // Need to either: (1) use local Supabase with Mailpit, or (2) configure proper SMTP service (Resend/SendGrid)
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
      // Check for user menu or profile indicator
      await expect(page.getByRole('button', { name: /account|profile/i })).toBeVisible({
        timeout: 5_000,
      });
    });

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });

  test.fixme('shows error for duplicate email', async ({ authPage, page }) => {
    // FIXME: Disabled due to Gmail SMTP rate limiting in tests
    // Need to either: (1) use local Supabase with Mailpit, or (2) configure proper SMTP service (Resend/SendGrid)
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

    // Should show error or redirect to check email
    // (Supabase behavior: sends another confirmation email)
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    // Cleanup
    await deleteAuthUserByEmail(mailbox.emailAddress);
  });
});
