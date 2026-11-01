import { Decimal } from 'decimal.js';

import { type ListingKind, type PriceType } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';
import { addDays, isIsoDate } from '../time/tashkent.js';

/** Условия наличия, которые проверяются по SPEC 8.3. Даты — `YYYY-MM-DD` (тип `date`). */
export interface ListingTerms {
  kind: ListingKind;
  volumeKg: Decimal.Value;
  minOrderKg: Decimal.Value;
  priceType: PriceType;
  pricePerKg: bigint | null;
  availableFrom: string;
  availableTo: string | null;
}

export interface ListingTermsContext {
  /** Сегодня по Ташкенту. */
  today: string;
  /** `order.minOrderKg`. */
  minOrderKg: number;
  /** `listing.nowMaxDaysAhead`. */
  nowMaxDaysAhead: number;
  /** `reservedKg + soldKg`: ниже этого объём уменьшить нельзя. */
  committedKg?: Decimal.Value;
  /** Проверять соответствие `kind` и `availableFrom` (при создании и их смене, D-51). */
  checkKind: boolean;
}

type FieldIssue = { field: string; constraints: string[] };

/** Бросает `VALIDATION_FAILED` с полями или `INSUFFICIENT_VOLUME`, если объём меньше обязательств. */
export function assertValidListingTerms(terms: ListingTerms, ctx: ListingTermsContext): void {
  const fields: FieldIssue[] = [];
  const add = (field: string, constraint: string) =>
    fields.push({ field, constraints: [constraint] });
  const volume = new Decimal(terms.volumeKg);
  const minOrder = new Decimal(terms.minOrderKg);

  if (volume.lte(0)) add('volumeKg', 'positive');
  if (minOrder.lt(ctx.minOrderKg)) add('minOrderKg', 'min');
  else if (volume.gt(0) && volume.lt(minOrder)) add('volumeKg', 'gteMinOrder');

  if (terms.priceType === 'FIXED') {
    if (terms.pricePerKg === null || terms.pricePerKg <= 0n) add('pricePerKg', 'positive');
  } else if (terms.pricePerKg !== null) {
    add('pricePerKg', 'mustBeEmpty');
  }

  const fromOk = isIsoDate(terms.availableFrom);
  if (!fromOk) add('availableFrom', 'isDate');
  if (terms.availableTo !== null) {
    if (!isIsoDate(terms.availableTo)) add('availableTo', 'isDate');
    else if (fromOk && terms.availableTo < terms.availableFrom) add('availableTo', 'afterFrom');
  }
  if (ctx.checkKind && fromOk) {
    const nowLimit = addDays(ctx.today, ctx.nowMaxDaysAhead);
    if (terms.kind === 'AVAILABLE_NOW' && terms.availableFrom > nowLimit) {
      add('availableFrom', 'nowWindow');
    }
    if (terms.kind === 'FUTURE_HARVEST' && terms.availableFrom <= nowLimit) {
      add('availableFrom', 'futureWindow');
    }
  }
  if (fields.length > 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid listing', { fields });
  }
  if (ctx.committedKg !== undefined && volume.lt(ctx.committedKg)) {
    throw new DomainError(ErrorCode.INSUFFICIENT_VOLUME, 'Volume is below reserved and sold', {
      committedKg: new Decimal(ctx.committedKg).toFixed(3),
    });
  }
}

/** Доступный объём: `volumeKg − reservedKg − soldKg` (SPEC 8.3). */
export function availableKg(l: {
  volumeKg: Decimal.Value;
  reservedKg: Decimal.Value;
  soldKg: Decimal.Value;
}): Decimal {
  return new Decimal(l.volumeKg).minus(l.reservedKg).minus(l.soldKg);
}
