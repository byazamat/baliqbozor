import { DomainError, ErrorCode } from '../errors.js';

/** Деньги — целые сумы (UZS) в BigInt. Логика расчёта сумм — в M6. */
export type Money = bigint;

const INTEGER = /^-?\d+$/;

/** BigInt → строка API (`"28000"`). */
export function moneyToString(value: Money): string {
  return value.toString();
}

/** Строка API → BigInt. Дробные и нечисловые значения отклоняются. */
export function parseMoney(value: string): Money {
  if (!INTEGER.test(value)) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid money value', { value });
  }
  return BigInt(value);
}
