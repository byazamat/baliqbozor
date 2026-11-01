import type { components } from '@baliqbozor/api-client';
import { nextVerificationStatus } from '@baliqbozor/domain';

type Org = components['schemas']['OrgDto'];
export type DecisionAction = 'verify' | 'reject' | 'suspend' | 'unsuspend';

const DOMAIN_ACTION = {
  verify: 'APPROVE',
  reject: 'REJECT',
  suspend: 'SUSPEND',
  unsuspend: 'UNSUSPEND',
} as const;

/** Комментарий обязателен для отказа и блокировки (API: `RequiredNoteDto`). */
export const NOTE_REQUIRED: ReadonlySet<DecisionAction> = new Set(['reject', 'suspend']);

/** Действия оператора, которые разрешает статусная машина домена (SPEC 8.1, D-39). */
export function availableActions(
  org: Pick<Org, 'verificationStatus' | 'type' | 'verifiedAt'>,
): DecisionAction[] {
  return (['verify', 'reject', 'suspend', 'unsuspend'] as const).filter((action) => {
    try {
      nextVerificationStatus(org.verificationStatus, DOMAIN_ACTION[action], {
        orgType: org.type,
        wasVerified: org.verifiedAt !== null,
      });
      return true;
    } catch {
      return false;
    }
  });
}
