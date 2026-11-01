import { readFileSync } from 'node:fs';
import path from 'node:path';

import { messages } from '@baliqbozor/i18n';
import { expect, type Page, test } from '@playwright/test';

const WEB = 'http://localhost:3000';
const DEV_CODE = '000000';
/** Владелец проверенного продавца «Jizzax Akva» из seed (D-47, M2.10). */
const SELLER_DIGITS = '900000004';
const TASHKENT = { latitude: 41.2995, longitude: 69.2401 };

const ru = messages.ru;
const PHOTO = readFileSync(
  path.resolve(import.meta.dirname, '../../../packages/db/seed-assets/silver-carp.jpg'),
);
/** Уникальная цена: по ней гость находит именно эту позицию в БД разработки. */
const price = String(30_000 + (Date.now() % 9_000));

async function signIn(page: Page, digits: string) {
  await page.goto(`${WEB}/ru/login`);
  await page.getByLabel(ru.auth.login.phoneLabel).fill(digits);
  await page.getByRole('button', { name: ru.auth.login.sendCode }).click();
  await page.getByLabel(ru.auth.login.codeLabel).fill(DEV_CODE);
  await page.getByRole('button', { name: ru.auth.login.submit }).click();
}

test('M2: seller publishes a listing with a photo; a guest finds it by filters and distance', async ({
  browser,
}) => {
  // Продавец: новая позиция → фото проходит проверку в worker → черновик → публикация.
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  await signIn(seller, SELLER_DIGITS);
  await expect(seller).toHaveURL(/\/ru\/org$/);
  await seller.getByRole('link', { name: ru.web.nav.listings }).click();
  await seller.getByRole('link', { name: ru.web.listings.add }).first().click();
  await expect(seller).toHaveURL(/\/ru\/listings\/new$/);

  await seller.getByLabel(ru.web.listings.farm).selectOption({ index: 1 });
  await seller.getByLabel(ru.web.listings.species).selectOption({ label: 'Толстолобик белый' });
  await seller.getByLabel(ru.web.listings.size).selectOption({ label: '1–2 кг' });
  await seller.getByLabel(ru.web.listings.volume).fill('1200');
  await seller.getByLabel(ru.web.listings.price).fill(price);
  await seller
    .getByTestId('media-LISTING_MEDIA')
    .locator('input[type=file]')
    .setInputFiles({ name: 'baliq.jpg', mimeType: 'image/jpeg', buffer: PHOTO });
  await expect(seller.getByTestId('media-tile')).toHaveAttribute('data-status', 'PROCESSED', {
    timeout: 20_000,
  });
  await seller.getByRole('button', { name: ru.web.listings.create }).click();
  await expect(seller).toHaveURL(/\/ru\/listings\/[0-9a-f-]{36}$/);
  await expect(seller.getByTestId('listing-status')).toHaveAttribute('data-status', 'DRAFT');
  await seller.getByRole('button', { name: ru.web.listings.publish }).click();
  await expect(seller.getByText(ru.web.listings.done.PUBLISH)).toBeVisible();
  await expect(seller.getByTestId('listing-status')).toHaveAttribute('data-status', 'ACTIVE');

  // Гость: каталог без входа → фильтр по виду и цене → «рядом со мной» (Ташкент) → карточка.
  const guestContext = await browser.newContext({
    geolocation: TASHKENT,
    permissions: ['geolocation'],
  });
  const guest = await guestContext.newPage();
  await guest.goto(`${WEB}/ru/catalog`);
  await guest.getByLabel(ru.web.catalog.species).selectOption({ label: 'Толстолобик белый' });
  await guest.getByLabel(ru.web.catalog.maxPrice).fill(price);
  await guest.getByRole('button', { name: ru.web.catalog.apply }).click();
  const card = guest.getByTestId('catalog-item').filter({ hasText: 'Джизакская область' }).first();
  await expect(card).toBeVisible();

  await guest.getByRole('button', { name: ru.web.catalog.nearMe }).click();
  await expect(guest.getByText(ru.web.catalog.nearOn.replace('{km}', '300'))).toBeVisible();
  await expect(card).toContainText('≈ 180 км');
  await card.getByRole('link').last().click();

  await expect(guest).toHaveURL(/\/ru\/listing\/[0-9a-f-]{36}\?near=/);
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText('Толстолобик белый, 1–2 кг');
  await expect(guest.getByText(ru.web.catalog.privacy)).toBeVisible();
  await expect(guest.getByRole('main')).not.toContainText('Jizzax Akva');
  await expect(guest.getByRole('link', { name: ru.web.catalog.order })).toBeVisible();

  await sellerContext.close();
  await guestContext.close();
});
