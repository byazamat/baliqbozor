/** Событие из outbox (`DomainEvent`, SPEC 5.4). Таблица появляется в M1. */
export interface OutboxEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
}

/** Источник событий: в M1 — Prisma с `FOR UPDATE SKIP LOCKED`. */
export interface OutboxSource {
  claimBatch(limit: number): Promise<OutboxEvent[]>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

/** Обработчик события: realtime, уведомления по каталогу (SPEC 11). */
export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

export const OUTBOX_SOURCE = Symbol('OUTBOX_SOURCE');
export const OUTBOX_HANDLER = Symbol('OUTBOX_HANDLER');
