import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { HEARTBEAT_QUEUE } from './heartbeat.constants.js';
import { HeartbeatState } from './heartbeat.state.js';

@Processor(HEARTBEAT_QUEUE)
export class HeartbeatProcessor extends WorkerHost {
  private readonly logger = new Logger(HeartbeatProcessor.name);

  constructor(private readonly state: HeartbeatState) {
    super();
  }

  process(): Promise<{ at: string }> {
    const at = new Date();
    this.state.beat(at);
    this.logger.debug(`heartbeat ${at.toISOString()}`);
    return Promise.resolve({ at: at.toISOString() });
  }
}
