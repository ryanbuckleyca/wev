import { expect, type Browser } from '@playwright/test';
import { AuthPage } from '../pages/auth.page';

export async function expectLoginFailsInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const authPage = new AuthPage(page);
  await authPage.gotoLogin('en');
  await authPage.login(email, password);
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  await context.close();
}

export async function expectLoginSucceedsInFreshContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const authPage = new AuthPage(page);
  await authPage.gotoLogin('en');
  await authPage.login(email, password);
  await expect(page).toHaveURL(/\/en(\/)?$/);
  await context.close();
}
