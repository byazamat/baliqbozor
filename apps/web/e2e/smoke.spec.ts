import { messages } from '@baliqbozor/i18n';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health', (route) =>
    route.fulfill({ json: { status: 'ok', service: 'api', uptimeSec: 1, time: '' } }),
  );
});

test('home in uz by default shows API status', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'uz');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.uz.web.home.title);
  await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'ok');
});

test('switches to ru and back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: messages.uz.common.languages.ru }).click();
  await expect(page).toHaveURL(/\/ru$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.ru.web.home.title);
  await expect(page.getByTestId('api-status')).toHaveText(messages.ru.health.ok);

  await page.getByRole('link', { name: messages.ru.common.languages.uz }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages.uz.web.home.title);
});

test('shows down state when API is unavailable', async ({ page }) => {
  await page.unroute('**/health');
  await page.route('**/health', (route) => route.abort());
  await page.goto('/ru');
  await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'down');
  await expect(page.getByRole('button', { name: messages.ru.common.retry })).toBeVisible();
});
