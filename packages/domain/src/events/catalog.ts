import type { MemberRole, OrgType, VerificationStatus } from '../enums.js';

/**
 * Доменные события (outbox, SPEC 5.4) и их payload. Пишутся в `DomainEvent` в транзакции
 * изменения; worker по ним рассылает уведомления (каталог SPEC 11.2) и realtime.
 * Payload — только идентификаторы и короткие значения, без персональных данных.
 */
export interface DomainEventPayloads {
  'user.registered': { userId: string };
  'org.created': { orgId: string; type: OrgType; createdById: string };
  'org.updated': { orgId: string; fields: string[]; actorUserId: string };
  'org.verification.submitted': { orgId: string; mediaIds: string[]; taskId: string };
  'org.verification.approved': { orgId: string; operatorId: string };
  'org.verification.rejected': { orgId: string; operatorId: string; note: string };
  'org.suspended': { orgId: string; operatorId: string; previousStatus: VerificationStatus };
  'org.unsuspended': { orgId: string; operatorId: string; status: VerificationStatus };
  'org.member.added': { orgId: string; userId: string; role: MemberRole; byUserId: string };
  'org.member.invited': { orgId: string; invitationId: string; role: MemberRole; byUserId: string };
  'org.member.role_changed': { orgId: string; userId: string; role: MemberRole; byUserId: string };
  'org.member.removed': { orgId: string; userId: string; byUserId: string };
  'ops.task.created': { taskId: string; type: string; orgId?: string };
}

export type DomainEventType = keyof DomainEventPayloads;

/** Тип агрегата для `DomainEvent.aggregateType`. */
export const AGGREGATE_OF: Readonly<Record<DomainEventType, string>> = {
  'user.registered': 'User',
  'org.created': 'Organization',
  'org.updated': 'Organization',
  'org.verification.submitted': 'Organization',
  'org.verification.approved': 'Organization',
  'org.verification.rejected': 'Organization',
  'org.suspended': 'Organization',
  'org.unsuspended': 'Organization',
  'org.member.added': 'Organization',
  'org.member.invited': 'Organization',
  'org.member.role_changed': 'Organization',
  'org.member.removed': 'Organization',
  'ops.task.created': 'OpsTask',
};

export const DOMAIN_EVENT_TYPES = Object.keys(AGGREGATE_OF) as DomainEventType[];

export function isDomainEventType(value: string): value is DomainEventType {
  return Object.hasOwn(AGGREGATE_OF, value);
}

/** Экспоненциальная пауза перед повтором обработки события: 5 с, 10 с, 20 с … до 10 мин. */
export function outboxRetryDelayMs(attempts: number): number {
  const base = 5_000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(base, 10 * 60_000);
}

/** После стольких неудач событие перестаёт обрабатываться и ждёт разбора (алерт SPEC 13.3). */
export const OUTBOX_MAX_ATTEMPTS = 10;
