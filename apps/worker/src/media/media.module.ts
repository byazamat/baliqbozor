import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module.js';
import { MEDIA_QUEUE } from './media.constants.js';
import { MediaEnqueuer } from './media.enqueuer.js';
import { MediaProcessor } from './media.processor.js';

@Module({
  imports: [OutboxModule, BullModule.registerQueue({ name: MEDIA_QUEUE })],
  providers: [MediaEnqueuer, MediaProcessor],
})
export class MediaModule {}
