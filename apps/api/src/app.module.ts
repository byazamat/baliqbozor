import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { loggerParams } from './common/logger.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { ENV, type Env } from './config/env.js';
import { InfraModule } from './infra/infra.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [LoggerModule.forRoot(loggerParams(env)), InfraModule, SettingsModule, HealthModule],
      providers: [
        { provide: ENV, useValue: env },
        // Порядок глобальных guard'ов: аутентификация (M1.4) регистрируется перед лимитом.
        { provide: APP_GUARD, useClass: RateLimitGuard },
      ],
      exports: [ENV],
    };
  }
}
