import { expect, type Browser } from "@playwright/test";
import type { AppLocale } from "@/i18n/routing";
import { AuthPage } from "@e2e/pages/auth.page";
import { getEmailProvider, waitForInboxLink, type InboxRef } from "./email";

export async function submitSignupAndExpectCheckEmail(
  authPage: AuthPage,
  email: string,
  password: string,
  locale: AppLocale = "en",
): Promise<void> {
  const page = authPage.page;
  await authPage.gotoSignup(locale);
  await authPage.signup(email, password);
  await expect(
    page.getByRole("heading", { name: /check your email/i }),
  ).toBeVisible({
    timeout: 10_000,
  });
}

export async function confirmEmailFromInboxAndExpectHome(
  authPage: AuthPage,
  inbox: InboxRef,
  locale: AppLocale = "en",
  timeoutMs?: number,
): Promise<void> {
  const page = authPage.page;
  const effectiveTimeoutMs =
    timeoutMs ?? (getEmailProvider() === "mailpit" ? 30_000 : 90_000);

  const confirmationLink = await waitForInboxLink(
    inbox.id,
    "/auth/callback",
    effectiveTimeoutMs,
  );
  await page.goto(confirmationLink);
  await expect(page).toHaveURL(new RegExp(`/${locale}(\\/)?$`), {
    timeout: 10_000,
  });
}

/**
 * Follow the magic link sent to an existing (confirmed) account when it re-signs up.
 * The signup route responds to a known email with a magic-link OTP whose template
 * emits a `/auth/callback?token_hash=...&type=magiclink` URL, so we match on the
 * `type=magiclink` marker to avoid picking up an earlier signup confirmation link.
 */
export async function signInViaMagicLinkFromInboxAndExpectHome(
  authPage: AuthPage,
  inbox: InboxRef,
  locale: AppLocale = "en",
  timeoutMs?: number,
): Promise<void> {
  const page = authPage.page;
  const effectiveTimeoutMs =
    timeoutMs ?? (getEmailProvider() === "mailpit" ? 30_000 : 90_000);

  const magicLink = await waitForInboxLink(
    inbox.id,
    "type=magiclink",
    effectiveTimeoutMs,
  );
  await page.goto(magicLink);
  // A valid magic link lands the user authenticated on the localized home page;
  // a broken/expired one would redirect to /auth/auth-code-error instead.
  await expect(page).toHaveURL(new RegExp(`/${locale}(\\/)?$`), {
    timeout: 10_000,
  });
  await expect(page).not.toHaveURL(/auth-code-error/);
}

export async function resetPasswordFromInboxAndExpectHome(
  authPage: AuthPage,
  inbox: InboxRef,
  newPassword: string,
  locale: AppLocale = "en",
  timeoutMs?: number,
): Promise<void> {
  const page = authPage.page;
  const effectiveTimeoutMs =
    timeoutMs ?? (getEmailProvider() === "mailpit" ? 30_000 : 90_000);

  await authPage.gotoForgotPassword(locale);
  await authPage.requestPasswordReset(inbox.emailAddress);
  await expect(
    page.getByRole("heading", { name: /check your email/i }),
  ).toBeVisible({
    timeout: 10_000,
  });

  const resetLink = await waitForInboxLink(
    inbox.id,
    "reset-password",
    effectiveTimeoutMs,
  );
  await page.goto(resetLink);
  await expect(
    page.getByRole("heading", { name: /reset password/i }),
  ).toBeVisible({
    timeout: 10_000,
  });

  await authPage.resetPassword(newPassword);
  await expect(page).toHaveURL(new RegExp(`/${locale}(\\/)?$`), {
    timeout: 10_000,
  });
}

export async function expectLoginFailsInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const authPage = new AuthPage(page);
    await authPage.gotoLogin("en");
    await authPage.login(email, password);

    await expect(
      page.getByText(
        /invalid login credentials|email not confirmed|user not found/i,
      ),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await context.close();
  }
}

export async function expectLoginSucceedsInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const authPage = new AuthPage(page);
    await authPage.gotoLogin("en");
    await authPage.login(email, password);
    await expect(page).toHaveURL(/\/en(\/)?$/);
  } finally {
    await context.close();
  }
}
