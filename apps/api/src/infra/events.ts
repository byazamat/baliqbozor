import type { TransactionClient } from '@baliqbozor/db';
import { AGGREGATE_OF, type DomainEventPayloads, type DomainEventType } from '@baliqbozor/domain';

import { toJsonValue } from '../common/json-value.js';

/**
 * Записать доменное событие в outbox в той же транзакции, что и изменение (CLAUDE.md, SPEC 5.4).
 * Уведомления и realtime — только из worker.
 */
export async function recordEvent<T extends DomainEventType>(
  tx: TransactionClient,
  type: T,
  aggregateId: string,
  payload: DomainEventPayloads[T],
): Promise<string> {
  const event = await tx.domainEvent.create({
    data: { type, aggregateType: AGGREGATE_OF[type], aggregateId, payload: toJsonValue(payload) },
    select: { id: true },
  });
  return event.id;
}
