import type { TransactionClient } from '@baliqbozor/db';

/** Событие из outbox (`DomainEvent`, SPEC 5.4). */
export interface OutboxEvent {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  /** Номер текущей попытки (увеличивается при захвате). */
  attempts: number;
}

/**
 * Обработчик события: уведомления по каталогу SPEC 11, позже realtime. Выполняется в транзакции,
 * в которой событие отмечается обработанным, — записи обработчика и отметка атомарны.
 */
export type OutboxHandler = (event: OutboxEvent, tx: TransactionClient) => Promise<void>;

export interface OutboxSource {
  /** Захватить до `limit` готовых событий (аренда, чтобы другой worker их не взял). */
  claimBatch(limit: number): Promise<OutboxEvent[]>;
  /** Выполнить обработчик и отметить событие обработанным в одной транзакции. */
  complete(event: OutboxEvent, handler: OutboxHandler): Promise<void>;
  /** Записать ошибку и отложить следующую попытку. */
  fail(event: OutboxEvent, error: string): Promise<void>;
}

export const OUTBOX_SOURCE = Symbol('OUTBOX_SOURCE');
export const OUTBOX_HANDLER = Symbol('OUTBOX_HANDLER');
