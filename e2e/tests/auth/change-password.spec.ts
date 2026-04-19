import { test, expect } from "@e2e/fixtures";
import { buildStrongPassword } from "@e2e/support/auth-user";
import { deleteAuthUserByEmail } from "@e2e/support/auth-admin";
import {
  confirmEmailFromInboxAndExpectHome,
  expectLoginFailsInFreshContext,
  expectLoginSucceedsInFreshContext,
  submitSignupAndExpectCheckEmail,
} from "@e2e/support/auth-flow";
import { createEphemeralInbox } from "@e2e/support/email";

test.describe("Change password flow @auth-email", () => {
  test.setTimeout(90_000);

  test("keeps session after password change and requires new password", async ({
    authPage,
    browser,
    page,
  }) => {
    const mailbox = await createEphemeralInbox();

    const oldPassword = buildStrongPassword("WevOldPass!");
    const newPassword = buildStrongPassword("WevNewPass!");

    try {
      await test.step("Sign up and confirm email", async () => {
        await submitSignupAndExpectCheckEmail(
          authPage,
          mailbox.emailAddress,
          oldPassword,
          "en",
        );
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, "en");
      });

      await test.step("Change password from account settings", async () => {
        await authPage.gotoAccountSettings("en");
        await expect(
          page.getByRole("heading", { name: /account settings/i }),
        ).toBeVisible({
          timeout: 10_000,
        });

        await page.getByLabel(/current password/i).fill(oldPassword);
        await page.getByLabel(/new password/i).fill(newPassword);
        await page.getByLabel(/confirm password/i).fill(newPassword);

        await page.getByRole("button", { name: /^save changes$/i }).click();

        await expect(page).toHaveURL(/\/en\/account-settings(\/)?$/, {
          timeout: 10_000,
        });
      });

      await test.step("Confirm user stays authenticated", async () => {
        await authPage.gotoAccountSettings("en");
        await expect(page).toHaveURL(/\/en\/account-settings(\/)?$/, {
          timeout: 10_000,
        });
        await expect(
          page.getByRole("heading", { name: /account settings/i }),
        ).toBeVisible({
          timeout: 10_000,
        });
      });

      await test.step("Old password fails; new password succeeds in fresh sessions", async () => {
        await expectLoginFailsInFreshContext(
          browser,
          mailbox.emailAddress,
          oldPassword,
        );
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
});
