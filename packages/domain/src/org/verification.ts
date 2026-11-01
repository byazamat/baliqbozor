import { type OrgType, VerificationStatus } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';

export type VerificationAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'SUSPEND' | 'UNSUSPEND';

export interface VerificationContext {
  orgType: OrgType;
  /** Была ли организация когда-либо верифицирована (`verifiedAt != null`) — для UNSUSPEND. */
  wasVerified: boolean;
}

/**
 * Машина статусов верификации (SPEC 8.1, D-29, D-30, D-39):
 * - SUBMIT (владелец): UNVERIFIED | REJECTED → PENDING;
 * - APPROVE (оператор): PENDING → VERIFIED; покупателя можно верифицировать и без заявки;
 * - REJECT (оператор): PENDING → REJECTED;
 * - SUSPEND: любой, кроме SUSPENDED → SUSPENDED;
 * - UNSUSPEND: SUSPENDED → VERIFIED, если была верифицирована, иначе UNVERIFIED.
 */
export function nextVerificationStatus(
  current: VerificationStatus,
  action: VerificationAction,
  ctx: VerificationContext,
): VerificationStatus {
  const S = VerificationStatus;
  switch (action) {
    case 'SUBMIT':
      if (current === S.UNVERIFIED || current === S.REJECTED) return S.PENDING;
      break;
    case 'APPROVE':
      if (current === S.PENDING) return S.VERIFIED;
      if (ctx.orgType === 'BUYER' && (current === S.UNVERIFIED || current === S.REJECTED)) {
        return S.VERIFIED;
      }
      break;
    case 'REJECT':
      if (current === S.PENDING) return S.REJECTED;
      break;
    case 'SUSPEND':
      if (current !== S.SUSPENDED) return S.SUSPENDED;
      break;
    case 'UNSUSPEND':
      if (current === S.SUSPENDED) return ctx.wasVerified ? S.VERIFIED : S.UNVERIFIED;
      break;
  }
  throw new DomainError(ErrorCode.INVALID_TRANSITION, `Cannot ${action} from ${current}`, {
    from: current,
    action,
  });
}

/** Юридические поля: меняются владельцем только до верификации (D-30). `type` неизменен (D-39). */
export const LEGAL_ORG_FIELDS = ['legalForm', 'name', 'tin'] as const;
export const IMMUTABLE_ORG_FIELDS = ['type'] as const;

export type OrgEditor = 'OWNER' | 'PLATFORM';

/**
 * Можно ли изменить перечисленные поля организации.
 * Владелец: ничего при SUSPENDED; юридические поля — только UNVERIFIED/REJECTED.
 * Оператор/администратор: всё, кроме неизменяемых.
 */
export function assertOrgFieldsEditable(
  status: VerificationStatus,
  fields: readonly string[],
  editor: OrgEditor,
): void {
  const immutable = fields.filter((f) => (IMMUTABLE_ORG_FIELDS as readonly string[]).includes(f));
  if (immutable.length > 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Field cannot be changed', {
      fields: immutable,
    });
  }
  if (editor === 'PLATFORM') return;
  if (status === VerificationStatus.SUSPENDED) {
    throw new DomainError(ErrorCode.ORG_SUSPENDED, 'Organization is suspended');
  }
  const legal = fields.filter((f) => (LEGAL_ORG_FIELDS as readonly string[]).includes(f));
  const legalLocked =
    status === VerificationStatus.PENDING || status === VerificationStatus.VERIFIED;
  if (legal.length > 0 && legalLocked) {
    throw new DomainError(ErrorCode.CONFLICT, 'Legal details are locked during and after review', {
      fields: legal,
      status,
    });
  }
}
