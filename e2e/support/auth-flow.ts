import { expect, type Browser } from '@playwright/test';
import { AuthPage } from '../pages/auth.page';

export async function expectLoginFailsInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const authPage = new AuthPage(page);
    await authPage.gotoLogin('en');
    await authPage.login(email, password);
    // Check for various error messages that indicate login failure
    await expect(
      page.getByText(/invalid login credentials|email not confirmed|user not found/i)
    ).toBeVisible({ timeout: 10000 });
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
    await authPage.gotoLogin('en');
    await authPage.login(email, password);
    await expect(page).toHaveURL(/\/en(\/)?$/);
  } finally {
    await context.close();
  }
}
