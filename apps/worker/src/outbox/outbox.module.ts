import {
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { ENV, type Env } from '../config/env.js';
import { NoopOutboxSource } from './noop-outbox.source.js';
import { OutboxPoller } from './outbox.poller.js';
import {
  OUTBOX_HANDLER,
  OUTBOX_SOURCE,
  type OutboxHandler,
  type OutboxSource,
} from './outbox.types.js';

@Module({
  providers: [
    { provide: OUTBOX_SOURCE, useClass: NoopOutboxSource },
    // Диспетчер событий (realtime + уведомления) подключается в M1.
    { provide: OUTBOX_HANDLER, useValue: (() => Promise.resolve()) satisfies OutboxHandler },
    {
      provide: OutboxPoller,
      inject: [OUTBOX_SOURCE, OUTBOX_HANDLER, ENV],
      useFactory: (source: OutboxSource, handler: OutboxHandler, env: Env) =>
        new OutboxPoller(source, handler, {
          intervalMs: env.OUTBOX_POLL_INTERVAL_MS,
          batchSize: env.OUTBOX_BATCH_SIZE,
        }),
    },
  ],
})
export class OutboxModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(OutboxPoller) private readonly poller: OutboxPoller) {}

  onApplicationBootstrap(): void {
    this.poller.start();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.poller.stop();
  }
}
