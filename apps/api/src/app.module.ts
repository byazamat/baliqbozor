import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { loggerParams } from './common/logger.js';
import { ENV, type Env } from './config/env.js';
import { InfraModule } from './infra/infra.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [LoggerModule.forRoot(loggerParams(env)), InfraModule, HealthModule],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
