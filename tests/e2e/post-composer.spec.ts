import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('post composer loads with the new modern layout and saves a screenshot', async ({ page }) => {
  await page.goto('/posts/new');
  await expect(page.getByRole('heading', { name: /Create new post/i })).toBeVisible();
  await expect(page.getByText(/Up to 15 MB\. Admin can update this limit anytime\./i).first()).toBeVisible();
  await expect(page.getByText(/Publish flow/i)).toHaveCount(0);

  fs.mkdirSync(path.join(process.cwd(), 'artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(process.cwd(), 'artifacts', 'post-composer-modern.png'), fullPage: true });
});

test('post composer keeps the editor usable after the layout cleanup', async ({ page }) => {
  await page.goto('/posts/new');
  const editor = page.getByRole('textbox', { name: /What’s happening\?/i });
  await editor.fill('Smoke test content for composer editor.');
  await expect(editor).toHaveValue('Smoke test content for composer editor.');
  await expect(page.getByText(/Publish flow/i)).toHaveCount(0);
});
