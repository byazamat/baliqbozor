import { Logger } from '@nestjs/common';

import type { OutboxHandler, OutboxSource } from './outbox.types.js';

export interface OutboxPollerOptions {
  intervalMs: number;
  batchSize: number;
}

const MAX_ERROR_LENGTH = 1000;

/**
 * Цикл опроса outbox: без наложений (следующий тик — после завершения текущего),
 * полная пачка — сразу следующая, пустая — пауза `intervalMs`.
 */
export class OutboxPoller {
  private readonly logger = new Logger(OutboxPoller.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private current: Promise<void> | undefined;

  constructor(
    private readonly source: OutboxSource,
    private readonly handler: OutboxHandler,
    private readonly options: OutboxPollerOptions,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    await this.current;
  }

  /** Одна итерация; возвращает количество событий в пачке. */
  async tick(): Promise<number> {
    const events = await this.source.claimBatch(this.options.batchSize);
    for (const event of events) {
      try {
        await this.handler(event);
        await this.source.markProcessed(event.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`outbox event ${event.id} (${event.type}) failed: ${message}`);
        await this.source.markFailed(event.id, message.slice(0, MAX_ERROR_LENGTH));
      }
    }
    return events.length;
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.current = this.tick()
        .then((count) =>
          this.schedule(count >= this.options.batchSize ? 0 : this.options.intervalMs),
        )
        .catch((err: unknown) => {
          this.logger.error(
            `outbox poll failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          this.schedule(this.options.intervalMs);
        });
    }, delayMs);
  }
}
