import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { FRESHNESS_QUEUE } from './freshness.constants.js';
import { FreshnessProcessor, FreshnessScheduler } from './freshness.processor.js';
import { FreshnessService } from './freshness.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: FRESHNESS_QUEUE })],
  providers: [FreshnessService, FreshnessProcessor, FreshnessScheduler],
  exports: [FreshnessService],
})
export class ListingsModule {}
