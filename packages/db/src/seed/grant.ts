import { normalizeUzPhone } from '@baliqbozor/domain';

import type { PrismaClient } from '../generated/prisma/client.js';
import type { PlatformRole } from '../generated/prisma/enums.js';

export const GRANTABLE_ROLES = ['OPERATOR', 'ADMIN', 'USER'] as const satisfies PlatformRole[];

export interface GrantResult {
  userId: string;
  phone: string;
  before: PlatformRole | null;
  after: PlatformRole;
  created: boolean;
}

/**
 * `pnpm admin:grant <phone> <OPERATOR|ADMIN>` (D-36): платформенная роль на staging и production.
 * Если номер ещё не входил, пользователь создаётся и получит роль при первом входе.
 * `USER` снимает роль. Изменение пишется в аудит (`actorRole = CLI`).
 */
export async function grantPlatformRole(
  prisma: PrismaClient,
  phoneInput: string,
  roleInput: string,
): Promise<GrantResult> {
  const phone = normalizeUzPhone(phoneInput);
  if (!phone) throw new Error(`Invalid Uzbekistan phone number: ${phoneInput}`);
  const role = roleInput.toUpperCase() as PlatformRole;
  if (!(GRANTABLE_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Role must be one of ${GRANTABLE_ROLES.join(', ')}`);
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { phone } });
    const user = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { platformRole: role } })
      : await tx.user.create({ data: { phone, platformRole: role } });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        actorRole: 'CLI',
        action: 'user.platformRole.grant',
        entityType: 'User',
        entityId: user.id,
        before: { platformRole: existing?.platformRole ?? null },
        after: { platformRole: role },
      },
    });
    return {
      userId: user.id,
      phone,
      before: existing?.platformRole ?? null,
      after: role,
      created: !existing,
    };
  });
}
