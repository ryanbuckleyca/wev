import { test, expect } from "@e2e/fixtures";
import { buildStrongPassword } from "@e2e/support/auth-user";
import { deleteAuthUserByEmail } from "@e2e/support/auth-admin";
import {
  confirmEmailFromInboxAndExpectHome,
  signInViaMagicLinkFromInboxAndExpectHome,
  submitSignupAndExpectCheckEmail,
} from "@e2e/support/auth-flow";
import { createEphemeralInbox } from "@e2e/support/email";

test.describe("Signup flow @auth-email", () => {
  test.setTimeout(90_000);

  test("creates account and confirms email", async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword("WevSignup!");

    try {
      await test.step("Submit signup form", async () => {
        await submitSignupAndExpectCheckEmail(
          authPage,
          mailbox.emailAddress,
          password,
          "en",
        );
      });

      await test.step("Confirm email and auto-login", async () => {
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, "en");
      });

      await test.step("Verify user is logged in", async () => {
        await authPage.gotoAccountSettings("en");
        await expect(
          page.getByRole("heading", { name: /account settings/i }),
        ).toBeVisible({
          timeout: 10_000,
        });
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });

  test("does not reveal account existence for duplicate email", async ({
    authPage,
    page,
  }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword("WevDupe!");

    try {
      // Create first account
      await submitSignupAndExpectCheckEmail(
        authPage,
        mailbox.emailAddress,
        password,
        "en",
      );
      await confirmEmailFromInboxAndExpectHome(authPage, mailbox, "en");

      // Sign out
      await page.goto("/auth/signout", { waitUntil: "networkidle" });

      // Try to sign up again with same email
      await submitSignupAndExpectCheckEmail(
        authPage,
        mailbox.emailAddress,
        password,
        "en",
      );

      // Anti-enumeration: an existing email shows the exact same signup-variant
      // "check your email" UX as a brand-new signup (see CheckEmailCard signup copy),
      // so the client can't tell the account already exists.
      await expect(
        page.getByRole("heading", { name: /check your email to continue/i }),
      ).toBeVisible();
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });

  test("existing account can sign in via magic link after re-signup", async ({
    authPage,
    page,
  }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword("WevMagic!");

    try {
      await test.step("Create and confirm the initial account", async () => {
        await submitSignupAndExpectCheckEmail(
          authPage,
          mailbox.emailAddress,
          password,
          "en",
        );
        await confirmEmailFromInboxAndExpectHome(authPage, mailbox, "en");
      });

      await test.step("Sign out to reach a logged-out state", async () => {
        await page.goto("/auth/signout", { waitUntil: "networkidle" });
      });

      await test.step("Re-signup with the same email shows check-email UI", async () => {
        // Same signup form + same success UI as a new account; the server quietly
        // sends a magic link instead of a fresh confirmation for the existing user.
        await submitSignupAndExpectCheckEmail(
          authPage,
          mailbox.emailAddress,
          password,
          "en",
        );
        await expect(
          page.getByRole("heading", { name: /check your email to continue/i }),
        ).toBeVisible();
      });

      await test.step("Follow the magic link and land authenticated", async () => {
        await signInViaMagicLinkFromInboxAndExpectHome(authPage, mailbox, "en");
      });

      await test.step("Verify the user is logged in", async () => {
        await authPage.gotoAccountSettings("en");
        await expect(
          page.getByRole("heading", { name: /account settings/i }),
        ).toBeVisible({ timeout: 10_000 });
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });
});
