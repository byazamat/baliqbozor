import type { LegalForm } from '../enums.js';

/** СТИР (ИНН) Узбекистана — 9 цифр. */
export const TIN_PATTERN = /^\d{9}$/;

/**
 * Проверка реквизитов при создании/правке (SPEC 8.1 п. 2): СТИР обязателен для всех форм,
 * кроме физического лица (`INDIVIDUAL`), и состоит из 9 цифр. Возвращает поля с ошибками.
 */
export function orgProfileIssues(input: {
  legalForm: LegalForm;
  tin: string | null | undefined;
}): string[] {
  const tin = input.tin?.trim() ?? '';
  if (tin === '') return input.legalForm === 'INDIVIDUAL' ? [] : ['tin'];
  return TIN_PATTERN.test(tin) ? [] : ['tin'];
}
