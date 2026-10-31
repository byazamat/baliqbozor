import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ENV, type Env } from '../config/env.js';

/** DI-токен общего подключения к Redis для BullMQ и проверки готовности. */
export const REDIS = Symbol('REDIS');

/** Подключение для BullMQ: `maxRetriesPerRequest: null` обязателен для блокирующих команд Worker. */
export function createBullConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => createBullConnection(env.REDIS_URL),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit().catch(() => undefined);
  }
}
