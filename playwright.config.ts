import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    headless: true,
  },
  webServer: {
    command: 'NEXT_PUBLIC_DEMO_MODE=1 npm run dev',
    url: 'http://127.0.0.1:3000/login',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
