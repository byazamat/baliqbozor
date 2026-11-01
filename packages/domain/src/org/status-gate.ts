import { type OrgType, VerificationStatus } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';

/** Действия организации, ограниченные статусом верификации (таблица SPEC 8.1). */
export type OrgGatedAction =
  | 'EDIT_PROFILE'
  | 'MANAGE_DRAFTS'
  | 'MANAGE_FARMS'
  | 'PUBLISH_LISTING'
  | 'SEND_OFFER'
  | 'CREATE_REQUEST'
  | 'ASSIGN_TO_SHIPMENT';

const REQUIRED_TYPE: Partial<Record<OrgGatedAction, OrgType>> = {
  MANAGE_FARMS: 'SELLER',
  PUBLISH_LISTING: 'SELLER',
  SEND_OFFER: 'SELLER',
  CREATE_REQUEST: 'BUYER',
  ASSIGN_TO_SHIPMENT: 'CARRIER',
};

const NEEDS_VERIFIED: ReadonlySet<OrgGatedAction> = new Set([
  'PUBLISH_LISTING',
  'SEND_OFFER',
  'ASSIGN_TO_SHIPMENT',
]);

/** Бросает `FORBIDDEN` (не тот тип), `ORG_SUSPENDED` или `ORG_NOT_VERIFIED`. */
export function assertOrgCan(
  action: OrgGatedAction,
  org: { type: OrgType; verificationStatus: VerificationStatus },
): void {
  const requiredType = REQUIRED_TYPE[action];
  if (requiredType && org.type !== requiredType) {
    throw new DomainError(ErrorCode.FORBIDDEN, `Only ${requiredType} organizations can ${action}`);
  }
  if (org.verificationStatus === VerificationStatus.SUSPENDED) {
    throw new DomainError(ErrorCode.ORG_SUSPENDED, 'Organization is suspended');
  }
  if (NEEDS_VERIFIED.has(action) && org.verificationStatus !== VerificationStatus.VERIFIED) {
    throw new DomainError(ErrorCode.ORG_NOT_VERIFIED, 'Organization is not verified', {
      status: org.verificationStatus,
    });
  }
}
