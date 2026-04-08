import { Page } from '@playwright/test';

export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"], button:has-text("Logga in"), button:has-text("Login"), button:has-text("Sign in")');
  await page.waitForURL(/^(?!.*\/$)/, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
}

export async function logoutViaUI(page: Page): Promise<void> {
  await page.goto('/');
  const logoutBtn = page.locator('button:has-text("Logga ut"), button:has-text("Logout"), button:has-text("Sign out"), button[aria-label="Logout"], button[aria-label="Log out")');
  if (await logoutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await logoutBtn.click();
  }
  await page.waitForLoadState('networkidle');
}

export async function clearSession(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
}

export async function waitForDashboard(page: Page): Promise<void> {
  await page.waitForURL(/\/(dashboard|applications|facilities)/, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
}
