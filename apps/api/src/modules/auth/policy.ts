import {
  assertOrgCan,
  canInOrg,
  canOnPlatform,
  DomainError,
  ErrorCode,
  type OrgAction,
  type OrgGatedAction,
  type PlatformAction,
} from '@baliqbozor/domain';

import type { AuthContext } from '../../common/request-context.js';

/** Политика действия в организации (SPEC 9) для сервисов; бросает `FORBIDDEN`. */
export function assertCanInOrg(auth: AuthContext, action: OrgAction): void {
  const allowed = canInOrg(
    {
      platformRole: auth.platformRole,
      membership: auth.org?.role ? { role: auth.org.role, orgType: auth.org.type } : undefined,
    },
    action,
  );
  if (!allowed) throw new DomainError(ErrorCode.FORBIDDEN, `Not allowed: ${action}`);
}

export function assertCanOnPlatform(auth: AuthContext, action: PlatformAction): void {
  if (!canOnPlatform(auth.platformRole, action)) {
    throw new DomainError(ErrorCode.FORBIDDEN, `Not allowed: ${action}`);
  }
}

/** Текущая организация запроса (после `@OrgScoped`). */
export function requireOrg(auth: AuthContext): NonNullable<AuthContext['org']> {
  if (!auth.org) throw new DomainError(ErrorCode.FORBIDDEN, 'Organization context required');
  return auth.org;
}

/** Ограничения по статусу организации (SPEC 8.1): `ORG_SUSPENDED`, `ORG_NOT_VERIFIED`, тип. */
export function assertOrgStatusAllows(auth: AuthContext, action: OrgGatedAction): void {
  const org = requireOrg(auth);
  assertOrgCan(action, { type: org.type, verificationStatus: org.verificationStatus });
}
