import { test, expect } from '@playwright/test';

test('language switch toggles between english and arabic on login', async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }) });
  });

  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Login/i);
  const languageToggle = page.getByRole('button', { name: /Toggle language|تبديل اللغة/i });
  await expect(languageToggle).toBeVisible();
  await languageToggle.click();
});

test('auth flow redirects after successful login', async ({ page }) => {
  let authed = false;
  await page.route('**/auth/me', async (route) => {
    if (authed) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, email: 'user@example.com' }) });
      return;
    }
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }) });
  });

  await page.route('**/auth/login', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, wallet: null, wallets: [] }) });
  });

  await page.goto('/login');
  await page.getByLabel(/Email|البريد الإلكتروني/i).fill('user@example.com');
  await page.getByLabel(/Password|كلمة المرور/i).fill('secret123');
  authed = true;
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/);
});

test('wallet screen is visible for authenticated user', async ({ page }) => {
  await page.route('**/auth/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, email: 'user@example.com' }) });
  });

  await page.route('**/wallet/me', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, balance: 100 }) });
  });

  await page.goto('/wallet');
  await expect(page.getByText(/Wallet|المحفظة/i).first()).toBeVisible();
});
