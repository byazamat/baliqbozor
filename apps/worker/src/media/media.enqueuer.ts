import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';

import { OutboxDispatcher } from '../outbox/outbox.dispatcher.js';
import { MEDIA_QUEUE } from './media.constants.js';
import type { MediaJob } from './media.processor.js';

/**
 * `media.uploaded` из outbox → задача очереди `media`. `jobId = mediaId`: повторная доставка
 * события не создаёт второй задачи; сама обработка идёт вне транзакции outbox (D-52).
 */
@Injectable()
export class MediaEnqueuer implements OnModuleInit {
  constructor(
    private readonly dispatcher: OutboxDispatcher,
    @InjectQueue(MEDIA_QUEUE) private readonly queue: Queue<MediaJob>,
  ) {}

  onModuleInit(): void {
    this.dispatcher.on('media.uploaded', async (event) => {
      const { mediaId } = event.payload as { mediaId: string };
      await this.queue.add(
        'process',
        { mediaId },
        {
          jobId: mediaId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
    });
  }
}
