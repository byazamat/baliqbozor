import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ENV, type Env } from '../config/env.js';
import { HEARTBEAT_QUEUE, HEARTBEAT_SCHEDULER_ID } from './heartbeat.constants.js';

/** Регистрирует повторяющуюся задачу heartbeat (идемпотентно при перезапусках). */
@Injectable()
export class HeartbeatScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(HEARTBEAT_QUEUE) private readonly queue: Queue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      HEARTBEAT_SCHEDULER_ID,
      { every: this.env.HEARTBEAT_INTERVAL_MS },
      { name: 'heartbeat', opts: { removeOnComplete: 10, removeOnFail: 50 } },
    );
  }
}
