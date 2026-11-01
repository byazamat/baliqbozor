import type { TransactionClient } from '@baliqbozor/db';
import { Injectable } from '@nestjs/common';

import { toJsonValue } from '../common/json-value.js';
import { currentRequest } from '../common/request-context.js';

export interface AuditEntry {
  /** `org.verify`, `settings.update`, `member.remove` … */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  /** По умолчанию — пользователь текущего запроса; `null` — система. */
  actor?: { userId: string; role: string; impersonatorId?: string } | null;
}

/** Журнал аудита (SPEC 13.2): пишется в транзакции действия, с IP и user-agent запроса. */
@Injectable()
export class AuditService {
  async record(tx: TransactionClient, entry: AuditEntry): Promise<void> {
    const req = currentRequest();
    const auth = req?.auth;
    const actor =
      entry.actor === undefined
        ? auth && {
            userId: auth.userId,
            role: auth.org?.role ? `${auth.platformRole}/${auth.org.role}` : auth.platformRole,
            impersonatorId: auth.impersonatorId,
          }
        : entry.actor;
    await tx.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorUserId: actor?.userId ?? null,
        actorRole: actor?.role ?? 'SYSTEM',
        impersonatorId: actor?.impersonatorId ?? null,
        ...(entry.before !== undefined ? { before: toJsonValue(entry.before) } : {}),
        ...(entry.after !== undefined ? { after: toJsonValue(entry.after) } : {}),
        ip: req?.ip ?? null,
        userAgent: req?.headers['user-agent']?.slice(0, 500) ?? null,
      },
    });
  }
}
