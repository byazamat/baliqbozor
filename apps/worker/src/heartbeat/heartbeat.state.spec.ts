import { Logger } from '@nestjs/common';

import { HeartbeatProcessor } from './heartbeat.processor.js';
import { HeartbeatState } from './heartbeat.state.js';

Logger.overrideLogger(false);

describe('heartbeat', () => {
  it('processor records the beat', async () => {
    const state = new HeartbeatState();
    expect(state.lastBeatAt).toBeNull();
    const result = await new HeartbeatProcessor(state).process();
    expect(state.lastBeatAt?.toISOString()).toBe(result.at);
  });
});
