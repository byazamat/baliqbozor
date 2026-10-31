import type { OutboxEvent, OutboxSource } from './outbox.types.js';

/** Заглушка до появления `DomainEvent` в схеме (M1): событий нет. */
export class NoopOutboxSource implements OutboxSource {
  claimBatch(): Promise<OutboxEvent[]> {
    return Promise.resolve([]);
  }

  markProcessed(): Promise<void> {
    return Promise.resolve();
  }

  markFailed(): Promise<void> {
    return Promise.resolve();
  }
}
