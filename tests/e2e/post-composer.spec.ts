import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('post composer loads with the new modern layout and saves a screenshot', async ({ page }) => {
  await page.goto('/posts/new');
  await expect(page.getByRole('heading', { name: /Create new post/i })).toBeVisible();
  await expect(page.getByText(/Up to 15 MB\. Admin can update this limit anytime\./i).first()).toBeVisible();
  await expect(page.getByText(/Visible progress during image transfer and post publishing\./i)).toBeVisible();

  fs.mkdirSync(path.join(process.cwd(), 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(process.cwd(), 'artifacts', 'post-composer-modern.png'), fullPage: true });
});

test('post composer remains bilingual after switching to Arabic', async ({ page }) => {
  await page.goto('/posts/new');
  await page.getByRole('button', { name: /^AR$|^EN$|تبديل اللغة/i }).first().click();
  await expect(page.getByRole('heading', { name: /بوست جديد/i })).toBeVisible();
  await expect(page.getByText(/حتى 15 MB|الأدمن يقدر يغيّر الحد ده/i).first()).toBeVisible();
});
