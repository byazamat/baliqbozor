import { messages } from '@baliqbozor/i18n';
import { expect, type Page, test } from '@playwright/test';

const WEB = 'http://localhost:3000';
const ADMIN = 'http://localhost:3001';
/** Код входа при `APP_ENV=local` (`OTP_DEV_BYPASS_CODE`, D-36). */
const DEV_CODE = '000000';
/** Оператор из seed (D-36, D-47). */
const OPERATOR_DIGITS = '900000001';

const ru = messages.ru;

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

/** Уникальный номер и СТИР на каждый прогон: БД разработки не очищается. */
const run = String(Date.now()).slice(-7);
const sellerDigits = `93${run}`;
const orgName = `Akva ${run}`;

async function signIn(page: Page, base: string, digits: string) {
  await page.goto(`${base}/ru/login`);
  await page.getByLabel(ru.auth.login.phoneLabel).fill(digits);
  await page.getByRole('button', { name: ru.auth.login.sendCode }).click();
  await page.getByLabel(ru.auth.login.codeLabel).fill(DEV_CODE);
  await page.getByRole('button', { name: ru.auth.login.submit }).click();
}

test('M1: seller registers and submits documents, operator verifies, seller is notified', async ({
  browser,
}) => {
  // Продавец (web): вход новым номером → онбординг → профиль организации.
  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  await signIn(seller, WEB, sellerDigits);
  await expect(seller).toHaveURL(/\/ru\/onboarding$/);

  await seller.getByTestId('org-type-SELLER').click();
  await seller.getByLabel(ru.org.fields.legalForm).selectOption('LLC');
  await seller.getByLabel(ru.org.fields.name).fill(orgName);
  await seller.getByLabel(ru.org.fields.tin).fill(`30${run}`);
  await seller.getByLabel(ru.org.fields.region).selectOption({ label: 'Самаркандская область' });
  await seller.getByRole('button', { name: ru.web.onboarding.submit }).click();

  await expect(seller).toHaveURL(/\/ru\/org$/);
  await expect(seller.getByRole('heading', { level: 1 })).toHaveText(orgName);
  await expect(seller.getByTestId('verification-status')).toHaveAttribute(
    'data-status',
    'UNVERIFIED',
  );

  // Документ: presigned PUT в хранилище → complete; затем отправка на проверку.
  await seller
    .locator('input[type=file]')
    .setInputFiles({ name: 'guvohnoma.png', mimeType: 'image/png', buffer: PNG });
  await expect(seller.getByTestId('documents').getByRole('listitem')).toHaveCount(1);
  await seller.getByLabel(ru.web.org.note).fill('Свидетельство о регистрации');
  await seller.getByRole('button', { name: ru.web.org.submit, exact: true }).click();
  await expect(seller.getByText(ru.web.org.submitted)).toBeVisible();
  await expect(seller.getByTestId('verification-status')).toHaveAttribute('data-status', 'PENDING');

  // Оператор (admin): очередь → поиск → карточка → документ → «Верифицировать».
  const operatorContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  await signIn(operator, ADMIN, OPERATOR_DIGITS);
  await expect(operator.getByRole('heading', { level: 1 })).toHaveText(ru.admin.queue.title);
  await operator.getByLabel(ru.admin.queue.search).fill(orgName);
  await operator.getByRole('button', { name: ru.common.search }).click();
  await operator.getByRole('link', { name: orgName }).click();

  await expect(operator.getByRole('heading', { level: 1 })).toHaveText(orgName);
  const documents = operator.getByTestId('documents');
  await expect(documents.getByRole('img')).toBeVisible();
  await expect(documents.getByRole('link', { name: ru.common.open })).toHaveAttribute(
    'href',
    /^http/,
  );
  await operator
    .getByTestId('org-actions')
    .getByRole('button', { name: ru.admin.org.verify })
    .click();
  const dialog = operator.getByRole('dialog');
  await dialog.getByLabel(new RegExp(ru.admin.org.noteLabel)).fill('Проверено по видеозвонку');
  await dialog.getByRole('button', { name: ru.admin.org.verify }).click();
  await expect(operator.getByText(ru.admin.org.done.verify)).toBeVisible();
  await expect(operator.getByTestId('verification-status')).toHaveAttribute(
    'data-status',
    'VERIFIED',
  );

  // Продавец: worker создал уведомление in-app; статус организации — «Проверена».
  const title = ru.notifications.org.verification.approved.title;
  await expect(async () => {
    await seller.goto(`${WEB}/ru/notifications`);
    await expect(seller.getByTestId('notifications')).toContainText(title, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(seller.getByTestId('notification-bell')).not.toHaveAttribute('data-count', '0');
  await seller.getByRole('button', { name: ru.web.inbox.markRead }).first().click();
  await expect(seller.getByTestId('notifications').locator('[data-unread]')).toHaveCount(0);

  await seller.goto(`${WEB}/ru/org`);
  await expect(seller.getByTestId('verification-status')).toHaveAttribute(
    'data-status',
    'VERIFIED',
  );

  await sellerContext.close();
  await operatorContext.close();
});
