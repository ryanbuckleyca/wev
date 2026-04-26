import { test, expect } from "@e2e/fixtures";
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

test.describe("Password reset flow @auth-email", () => {
  test.setTimeout(120_000);

  test("resets password successfully", async ({ authPage, browser }) => {
    const mailbox = await createEphemeralInbox();
    const initialPassword = buildStrongPassword("WevInitial!");
    const newPassword = buildStrongPassword("WevReset!");

    try {
      await test.step("Create and confirm account", async () => {
        await submitSignupAndExpectCheckEmail(
          authPage,
          mailbox.emailAddress,
          initialPassword,
          "en",
        );
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, "en");
      });

      await test.step("Request password reset and set new password", async () => {
        await resetPasswordFromInboxAndExpectHome(
          authPage,
          mailbox,
          newPassword,
          "en",
        );
      });

      await test.step("Verify old password fails", async () => {
        await expectLoginFailsInFreshContext(
          browser,
          mailbox.emailAddress,
          initialPassword,
        );
      });

      await test.step("Verify new password works", async () => {
        await expectLoginSucceedsInFreshContext(
          browser,
          mailbox.emailAddress,
          newPassword,
        );
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });

  test("handles invalid reset link gracefully", async ({ page }) => {
    await page.goto("/en/reset-password?token=invalid&type=recovery");

    // Should show error or redirect to error page
    await expect(
      page
        .getByText(/invalid|expired|error/i)
        .or(page.getByRole("heading", { name: /error/i })),
    ).toBeVisible({ timeout: 10_000 });
  });
});
