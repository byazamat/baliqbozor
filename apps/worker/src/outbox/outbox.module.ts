import {
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { ENV, type Env } from '../config/env.js';
import { OutboxDispatcher } from './outbox.dispatcher.js';
import { OutboxPoller } from './outbox.poller.js';
import { OUTBOX_SOURCE, type OutboxSource } from './outbox.types.js';
import { PrismaOutboxSource } from './prisma-outbox.source.js';

@Module({
  providers: [
    { provide: OUTBOX_SOURCE, useClass: PrismaOutboxSource },
    OutboxDispatcher,
    {
      provide: OutboxPoller,
      inject: [OUTBOX_SOURCE, OutboxDispatcher, ENV],
      useFactory: (source: OutboxSource, dispatcher: OutboxDispatcher, env: Env) =>
        new OutboxPoller(source, dispatcher.handle, {
          intervalMs: env.OUTBOX_POLL_INTERVAL_MS,
          batchSize: env.OUTBOX_BATCH_SIZE,
        }),
    },
  ],
  exports: [OutboxDispatcher, OutboxPoller, OUTBOX_SOURCE],
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
