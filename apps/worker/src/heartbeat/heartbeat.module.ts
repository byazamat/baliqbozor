import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { HEARTBEAT_QUEUE } from './heartbeat.constants.js';
import { HeartbeatProcessor } from './heartbeat.processor.js';
import { HeartbeatScheduler } from './heartbeat.scheduler.js';
import { HeartbeatState } from './heartbeat.state.js';

@Module({
  imports: [BullModule.registerQueue({ name: HEARTBEAT_QUEUE })],
  providers: [HeartbeatState, HeartbeatProcessor, HeartbeatScheduler],
  exports: [HeartbeatState, HeartbeatScheduler],
})
export class HeartbeatModule {}
