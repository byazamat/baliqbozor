import type { RequestStatus } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';

/** Действия над заявкой (SPEC 8.4, D-58). `FIRST_OFFER` и `EXPIRE` выполняет система. */
export type RequestAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'FIRST_OFFER' | 'CANCEL' | 'EXPIRE';

const LIVE: readonly RequestStatus[] = ['OPEN', 'OFFERS_RECEIVED'];

/** Заявка открыта для предложений. */
export const isRequestOpen = (status: RequestStatus) => LIVE.includes(status);

export function nextRequestStatus(
  status: RequestStatus,
  action: RequestAction,
  ctx: { needsReview?: boolean } = {},
): RequestStatus {
  const next = ((): RequestStatus | null => {
    switch (action) {
      case 'SUBMIT':
        return status === 'DRAFT' ? (ctx.needsReview ? 'PENDING_REVIEW' : 'OPEN') : null;
      case 'APPROVE':
        return status === 'PENDING_REVIEW' ? 'OPEN' : null;
      case 'REJECT':
        return status === 'PENDING_REVIEW' ? 'CANCELLED' : null;
      case 'FIRST_OFFER':
        return status === 'OPEN' ? 'OFFERS_RECEIVED' : null;
      case 'CANCEL':
        return status === 'DRAFT' || status === 'PENDING_REVIEW' || isRequestOpen(status)
          ? 'CANCELLED'
          : null;
      case 'EXPIRE':
        return isRequestOpen(status) ? 'EXPIRED' : null;
    }
  })();
  if (!next) {
    throw new DomainError(ErrorCode.INVALID_TRANSITION, `Cannot ${action} from ${status}`, {
      from: status,
      action,
    });
  }
  return next;
}
