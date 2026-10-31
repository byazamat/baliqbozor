import { Decimal } from 'decimal.js';

import { DomainError, ErrorCode } from '../errors.js';

/** Вес в кг: Decimal(12,3) в БД, строка с тремя знаками в API (`"1250.500"`). */
export type Weight = Decimal;

export const WEIGHT_SCALE = 3;

const WEIGHT = /^\d+(\.\d{1,3})?$/;

export function parseWeight(value: string): Weight {
  if (!WEIGHT.test(value)) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid weight value', { value });
  }
  return new Decimal(value);
}

/** Любое Decimal-подобное значение → строка API с тремя знаками. */
export function weightToString(value: Decimal.Value | { toString(): string }): string {
  return new Decimal(typeof value === 'object' ? value.toString() : value).toFixed(WEIGHT_SCALE);
}

export { Decimal };
