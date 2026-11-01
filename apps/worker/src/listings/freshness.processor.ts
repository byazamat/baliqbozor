import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  FRESHNESS_CRON,
  FRESHNESS_QUEUE,
  FRESHNESS_SCHEDULER_ID,
  FRESHNESS_TZ,
} from './freshness.constants.js';
import { type FreshnessRunResult, FreshnessService } from './freshness.service.js';

@Processor(FRESHNESS_QUEUE)
export class FreshnessProcessor extends WorkerHost {
  constructor(private readonly freshness: FreshnessService) {
    super();
  }

  process(): Promise<FreshnessRunResult> {
    return this.freshness.run();
  }
}

/** Регистрирует ежечасную задачу (идемпотентно при перезапусках). */
@Injectable()
export class FreshnessScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(FRESHNESS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      FRESHNESS_SCHEDULER_ID,
      { pattern: FRESHNESS_CRON, tz: FRESHNESS_TZ },
      { name: 'freshness', opts: { removeOnComplete: 48, removeOnFail: 100 } },
    );
  }
}
