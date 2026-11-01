import { defineConfig, devices } from '@playwright/test';

/**
 * Сквозная приёмка M1 и M2 (SPEC 14.1, 14.3): настоящие api, worker, web и admin поверх БД после
 * `db:migrate` и `db:seed`. Сначала нужны `pnpm infra:up` и `pnpm build`; локально
 * переиспользуются уже запущенные серверы.
 */
const reuse = !process.env.CI;

export default defineConfig({
  testDir: './e2e-acceptance',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'on-first-retry', ...devices['Desktop Chrome'] },
  projects: [{ name: 'chromium' }],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://localhost:4000/health',
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: 'node dist/main.js',
      cwd: '../worker',
      url: 'http://localhost:4010/health',
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start --port 3000',
      url: 'http://localhost:3000',
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start --port 3001',
      cwd: '../admin',
      url: 'http://localhost:3001',
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
});
