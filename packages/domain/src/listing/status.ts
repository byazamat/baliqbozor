import { Decimal } from 'decimal.js';

import type { ListingPauseReason, ListingStatus, OrgType, VerificationStatus } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';
import { assertOrgCan } from '../org/status-gate.js';

/** Действия над наличием (SPEC 8.3, D-51). Последние три выполняет система. */
export type ListingAction =
  | 'PUBLISH'
  | 'RESUME'
  | 'PAUSE'
  | 'CONFIRM'
  | 'ARCHIVE'
  | 'AUTOPAUSE'
  | 'EXPIRE'
  | 'FARM_DEACTIVATED';

export interface ListingState {
  status: ListingStatus;
  pauseReason: ListingPauseReason | null;
}

const ACTIVE: ListingState = { status: 'ACTIVE', pauseReason: null };

/** Следующее состояние или `INVALID_TRANSITION`. Проверки публикации — {@link assertPublishable}. */
export function nextListingState(
  state: ListingState,
  action: ListingAction,
  ctx: { reservedKg: Decimal.Value },
): ListingState {
  const { status, pauseReason } = state;
  const result = ((): ListingState | null => {
    switch (action) {
      case 'PUBLISH':
        return status === 'DRAFT' || status === 'PAUSED' || status === 'EXPIRED' ? ACTIVE : null;
      case 'RESUME':
        return status === 'PAUSED' ? ACTIVE : null;
      case 'PAUSE':
        return status === 'ACTIVE' ? { status: 'PAUSED', pauseReason: 'MANUAL' } : null;
      case 'CONFIRM':
        if (status === 'ACTIVE' || status === 'SOLD_OUT') return { status, pauseReason: null };
        return status === 'PAUSED' && pauseReason === 'FRESHNESS' ? ACTIVE : null;
      case 'ARCHIVE':
        if (status === 'ARCHIVED') return null;
        if (new Decimal(ctx.reservedKg).gt(0)) {
          throw new DomainError(ErrorCode.INVALID_TRANSITION, 'Listing has reservations', {
            from: status,
            action,
            reason: 'HAS_RESERVATIONS',
          });
        }
        return { status: 'ARCHIVED', pauseReason: null };
      case 'AUTOPAUSE':
        return status === 'ACTIVE' ? { status: 'PAUSED', pauseReason: 'FRESHNESS' } : null;
      case 'EXPIRE':
        return status === 'ACTIVE' || status === 'PAUSED' || status === 'SOLD_OUT'
          ? { status: 'EXPIRED', pauseReason: null }
          : null;
      case 'FARM_DEACTIVATED':
        return status === 'ACTIVE' ? { status: 'PAUSED', pauseReason: 'FARM_INACTIVE' } : null;
    }
  })();
  if (!result) {
    throw new DomainError(ErrorCode.INVALID_TRANSITION, `Cannot ${action} from ${status}`, {
      from: status,
      action,
    });
  }
  return result;
}

export interface PublishContext {
  org: { type: OrgType; verificationStatus: VerificationStatus };
  farmActive: boolean;
  processedPhotos: number;
  availableKg: Decimal.Value;
  availableTo: string | null;
  today: string;
}

/** Условия публикации и возобновления (SPEC 10.3, D-51): верификация, хозяйство, фото, объём, даты. */
export function assertPublishable(ctx: PublishContext): void {
  assertOrgCan('PUBLISH_LISTING', ctx.org);
  const fields: { field: string; constraints: string[] }[] = [];
  if (!ctx.farmActive) fields.push({ field: 'farmId', constraints: ['farmActive'] });
  if (ctx.processedPhotos < 1) fields.push({ field: 'mediaIds', constraints: ['photoRequired'] });
  if (new Decimal(ctx.availableKg).lte(0)) {
    fields.push({ field: 'volumeKg', constraints: ['availableVolume'] });
  }
  if (ctx.availableTo !== null && ctx.availableTo < ctx.today) {
    fields.push({ field: 'availableTo', constraints: ['notPast'] });
  }
  if (fields.length > 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Listing cannot be published', { fields });
  }
}

/** После правки объёма: `ACTIVE` без доступного объёма → `SOLD_OUT` и обратно (D-51). */
export function statusAfterVolumeChange(
  status: ListingStatus,
  available: Decimal.Value,
): ListingStatus {
  const left = new Decimal(available);
  if (status === 'ACTIVE' && left.lte(0)) return 'SOLD_OUT';
  if (status === 'SOLD_OUT' && left.gt(0)) return 'ACTIVE';
  return status;
}

/** Статусы, в которых наличие можно править (всё, кроме архива). */
export function isListingEditable(status: ListingStatus): boolean {
  return status !== 'ARCHIVED';
}
