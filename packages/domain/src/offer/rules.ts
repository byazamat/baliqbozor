import { Decimal } from 'decimal.js';

import type { OfferStatus } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';
import { isIsoDate } from '../time/tashkent.js';

export interface OfferTerms {
  volumeKg: Decimal.Value;
  pricePerKg: bigint;
  /** Дата готовности к отгрузке `YYYY-MM-DD`. */
  availableDate: string;
}

export interface OfferContext {
  today: string;
  deliveryDateTo: string;
  volumeRemaining: Decimal.Value;
  /** `order.minOrderKg` — когда позиция наличия не указана. */
  minOrderKg: number;
  listing: { availableKg: Decimal.Value; minOrderKg: Decimal.Value } | null;
}

/** Правила предложения (SPEC 8.6, D-58); бросает `VALIDATION_FAILED` с полями. */
export function assertValidOffer(t: OfferTerms, ctx: OfferContext): void {
  const fields: { field: string; constraints: string[] }[] = [];
  const add = (field: string, c: string) => fields.push({ field, constraints: [c] });
  const volume = new Decimal(t.volumeKg);
  const min = ctx.listing ? new Decimal(ctx.listing.minOrderKg) : new Decimal(ctx.minOrderKg);
  if (volume.lt(min)) add('volumeKg', 'min');
  else if (ctx.listing && volume.gt(ctx.listing.availableKg)) add('volumeKg', 'lteAvailable');
  else if (volume.gt(ctx.volumeRemaining)) add('volumeKg', 'lteRemaining');
  if (t.pricePerKg <= 0n) add('pricePerKg', 'positive');
  if (!isIsoDate(t.availableDate)) add('availableDate', 'isDate');
  else if (t.availableDate < ctx.today) add('availableDate', 'notPast');
  else if (t.availableDate > ctx.deliveryDateTo) add('availableDate', 'beforeDeliveryEnd');
  if (fields.length > 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid offer', { fields });
  }
}

/** Срок предложения: `offer.defaultValidityHours`, но не позже срока заявки (SPEC 8.6). */
export function offerValidUntil(now: Date, validityHours: number, requestExpiresAt: Date): Date {
  const byHours = new Date(now.getTime() + validityHours * 60 * 60 * 1000);
  return byHours < requestExpiresAt ? byHours : requestExpiresAt;
}

export type OfferAction = 'UPDATE' | 'WITHDRAW' | 'EXPIRE';

/** Править, отзывать и истекать может только `PENDING` (SPEC 8.6). */
export function nextOfferStatus(status: OfferStatus, action: OfferAction): OfferStatus {
  if (status !== 'PENDING') {
    throw new DomainError(ErrorCode.INVALID_TRANSITION, `Cannot ${action} from ${status}`, {
      from: status,
      action,
    });
  }
  return action === 'UPDATE' ? 'PENDING' : action === 'WITHDRAW' ? 'WITHDRAWN' : 'EXPIRED';
}
