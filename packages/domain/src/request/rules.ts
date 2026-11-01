import { Decimal } from 'decimal.js';

import { DomainError, ErrorCode } from '../errors.js';
import { isIsoDate } from '../time/tashkent.js';

/** Условия заявки покупателя (SPEC 8.4). Даты — `YYYY-MM-DD`. */
export interface RequestTerms {
  volumeKg: Decimal.Value;
  minAcceptableKg: Decimal.Value | null;
  deliveryDateFrom: string;
  deliveryDateTo: string;
  targetPricePerKg: bigint | null;
  radiusKm: number;
}

type FieldIssue = { field: string; constraints: string[] };

/** Бросает `VALIDATION_FAILED` с перечнем полей. */
export function assertValidRequestTerms(
  t: RequestTerms,
  ctx: { today: string; minOrderKg: number },
): void {
  const fields: FieldIssue[] = [];
  const add = (field: string, c: string) => fields.push({ field, constraints: [c] });
  const volume = new Decimal(t.volumeKg);
  if (volume.lt(ctx.minOrderKg)) add('volumeKg', 'min');
  if (t.minAcceptableKg !== null) {
    const minAcc = new Decimal(t.minAcceptableKg);
    if (minAcc.lt(ctx.minOrderKg)) add('minAcceptableKg', 'min');
    else if (minAcc.gt(volume)) add('minAcceptableKg', 'lteVolume');
  }
  const fromOk = isIsoDate(t.deliveryDateFrom);
  if (!fromOk) add('deliveryDateFrom', 'isDate');
  else if (t.deliveryDateFrom < ctx.today) add('deliveryDateFrom', 'notPast');
  if (!isIsoDate(t.deliveryDateTo)) add('deliveryDateTo', 'isDate');
  else if (fromOk && t.deliveryDateTo < t.deliveryDateFrom) add('deliveryDateTo', 'afterFrom');
  if (t.targetPricePerKg !== null && t.targetPricePerKg <= 0n) add('targetPricePerKg', 'positive');
  if (!Number.isInteger(t.radiusKm) || t.radiusKm < 1 || t.radiusKm > 2000)
    add('radiusKm', 'range');
  if (fields.length > 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid request', { fields });
  }
}

const HOUR = 60 * 60 * 1000;

/**
 * Срок заявки (SPEC 8.4): начало окна доставки (полночь по Ташкенту) или
 * `submittedAt + request.defaultExpiryDays` — что раньше.
 */
export function requestExpiresAt(
  submittedAt: Date,
  deliveryDateFrom: string,
  defaultExpiryDays: number,
): Date {
  const deliveryStart = new Date(Date.parse(`${deliveryDateFrom}T00:00:00Z`) - 5 * HOUR);
  const byDays = new Date(submittedAt.getTime() + defaultExpiryDays * 24 * HOUR);
  return deliveryStart < byDays ? deliveryStart : byDays;
}

/** Остаток объёма: `volumeKg − Σ plannedKg` активных строк заказов по заявке (SPEC 8.4). */
export function volumeRemaining(volumeKg: Decimal.Value, plannedKg: Decimal.Value[]): Decimal {
  const left = plannedKg.reduce<Decimal>((acc, v) => acc.minus(v), new Decimal(volumeKg));
  return left.isNegative() ? new Decimal(0) : left;
}

/** Минимальный приемлемый объём: по умолчанию весь объём (SPEC 8.4). */
export function minAcceptable(
  volumeKg: Decimal.Value,
  minAcceptableKg: Decimal.Value | null,
): Decimal {
  return new Decimal(minAcceptableKg ?? volumeKg);
}
