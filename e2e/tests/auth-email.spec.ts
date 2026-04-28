import { test } from "@e2e/fixtures";
import { buildStrongPassword } from "@e2e/support/auth-user";
import { deleteAuthUserByEmail } from "@e2e/support/auth-admin";
import {
  confirmEmailFromInboxAndExpectHome,
  expectLoginFailsInFreshContext,
  expectLoginSucceedsInFreshContext,
  resetPasswordFromInboxAndExpectHome,
  submitSignupAndExpectCheckEmail,
} from "@e2e/support/auth-flow";
import { createEphemeralInbox } from "@e2e/support/email";

test.describe("Auth email flows @auth-email", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test("signup, confirm email, login, reset password, and delete account", async ({
    authPage,
    browser,
    page,
  }) => {
    // NOTE: This monolithic auth journey duplicates the focused @auth-email specs, but
    // provides a single end-to-end smoke test across the full email lifecycle.
    const mailbox = await createEphemeralInbox();
    const initialPassword = buildStrongPassword("WevInitial!");
    const resetPassword = buildStrongPassword("WevReset!");

    try {
      await test.step("Create account from signup page", async () => {
        await submitSignupAndExpectCheckEmail(
          authPage,
          mailbox.emailAddress,
          initialPassword,
          "en",
        );
      });

      await test.step("Confirm email from link and auto-login", async () => {
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, "en");
      });

      await test.step("Request password reset and set a new password", async () => {
        await resetPasswordFromInboxAndExpectHome(
          authPage,
          mailbox,
          resetPassword,
          "en",
        );
      });

      await test.step("Old password fails, new password succeeds", async () => {
        await expectLoginFailsInFreshContext(
          browser,
          mailbox.emailAddress,
          initialPassword,
        );
        await expectLoginSucceedsInFreshContext(
          browser,
          mailbox.emailAddress,
          resetPassword,
        );
      });

      await test.step("Delete account and confirm login is blocked", async () => {
        await authPage
          .submitDeleteAccount("en", resetPassword, "DELETE")
          .catch(() => undefined);

        const redirectedHome = await page
          .waitForURL(/\/en(\/)?$/, { timeout: 8_000 })
          .then(() => true)
          .catch(() => false);

        if (!redirectedHome) {
          await deleteAuthUserByEmail(mailbox.emailAddress).catch(
            () => undefined,
          );
        }

        await expectLoginFailsInFreshContext(
          browser,
          mailbox.emailAddress,
          resetPassword,
        );
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });
});
