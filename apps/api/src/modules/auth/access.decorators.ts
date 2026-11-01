import type { MemberRole, OrgType, PlatformRole } from '@baliqbozor/domain';
import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ROLES = 'platformRoles';
export const ORG_SCOPE = 'orgScope';

/** Только для указанных платформенных ролей (SPEC 9: OPERATOR, ADMIN). */
export const PlatformRoles = (...roles: PlatformRole[]) => SetMetadata(PLATFORM_ROLES, roles);

export interface OrgScopeOptions {
  /** Допустимые типы организации (S/B/C в SPEC 10.3). */
  types?: OrgType[];
  /** Допустимые роли в организации; по умолчанию — любой член. */
  roles?: MemberRole[];
  /** Пускать оператора/администратора без членства (SPEC 9: «✓» у O/A). */
  allowPlatformStaff?: boolean;
  /** Организация из параметра пути (`/orgs/:id`); `X-Org-Id`, если передан, должен совпадать (D-14). */
  fromParam?: string;
}

/**
 * Эндпоинт уровня организации: guard проверяет членство (`X-Org-Id`) и кладёт организацию
 * в `req.auth.org`. Права на конкретный ресурс проверяет политика в сервисе.
 */
export const OrgScoped = (options: OrgScopeOptions = {}) => SetMetadata(ORG_SCOPE, options);
