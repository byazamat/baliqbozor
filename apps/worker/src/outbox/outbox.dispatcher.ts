import type { TransactionClient } from '@baliqbozor/db';
import { isDomainEventType } from '@baliqbozor/domain';
import { Injectable, Logger } from '@nestjs/common';

import type { OutboxEvent, OutboxHandler } from './outbox.types.js';

export type EventHandler = (event: OutboxEvent, tx: TransactionClient) => Promise<void>;

/**
 * Маршрутизация событий outbox к обработчикам (уведомления — M1.8, realtime — M4).
 * Событие без обработчиков считается обработанным; неизвестный тип — тоже, с предупреждением.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  on(type: string, handler: EventHandler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  readonly handle: OutboxHandler = async (event, tx) => {
    if (!isDomainEventType(event.type)) {
      this.logger.warn(`Unknown outbox event type ${event.type} (${event.id}) — skipped`);
      return;
    }
    for (const handler of this.handlers.get(event.type) ?? []) await handler(event, tx);
  };
}
