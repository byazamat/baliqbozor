import { BullModule } from '@nestjs/bullmq';
import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';

import { ENV, type Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { HeartbeatModule } from './heartbeat/heartbeat.module.js';
import { REDIS, RedisModule } from './infra/redis.js';
import { loggerParams } from './logger.js';
import { OutboxModule } from './outbox/outbox.module.js';

@Global()
@Module({})
class EnvModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: EnvModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}

@Module({})
export class WorkerModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        EnvModule.forRoot(env),
        LoggerModule.forRoot(loggerParams(env)),
        RedisModule,
        BullModule.forRootAsync({
          inject: [REDIS],
          useFactory: (connection: Redis) => ({ connection, prefix: 'bq' }),
        }),
        HeartbeatModule,
        OutboxModule,
        HealthModule,
      ],
    };
  }
}
