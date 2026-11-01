import type { TransactionClient } from '@baliqbozor/db';
import { AGGREGATE_OF, type DomainEventPayloads, type DomainEventType } from '@baliqbozor/domain';

/** Событие из задачи worker — в outbox, в той же транзакции, что и изменение (SPEC 5.4). */
export async function recordEvent<T extends DomainEventType>(
  tx: TransactionClient,
  type: T,
  aggregateId: string,
  payload: DomainEventPayloads[T],
): Promise<void> {
  await tx.domainEvent.create({
    data: {
      type,
      aggregateType: AGGREGATE_OF[type],
      aggregateId,
      payload: payload,
    },
  });
}
