import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ENV, type Env } from '../config/env.js';

/** Общее подключение к Redis (кэш настроек, rate limit, очереди). Подключается лениво. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private lastErrorLog = 0;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    this.client.on('error', (err: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLog > 30_000) {
        this.lastErrorLog = now;
        this.logger.warn(`Redis error: ${err.message}`);
      }
    });
  }

  async ping(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
    await this.client.ping();
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
