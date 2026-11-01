import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { loggerParams } from './common/logger.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';
import { ENV, type Env } from './config/env.js';
import { InfraModule } from './infra/infra.module.js';
import { AccessGuard } from './modules/auth/access.guard.js';
import { AuthGuard } from './modules/auth/auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { DictModule } from './modules/dict/dict.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MeModule } from './modules/me/me.module.js';
import { OrgsModule } from './modules/orgs/orgs.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        LoggerModule.forRoot(loggerParams(env)),
        InfraModule,
        SettingsModule,
        AuthModule,
        HealthModule,
        MeModule,
        OrgsModule,
        AddressesModule,
        DictModule,
      ],
      providers: [
        { provide: ENV, useValue: env },
        // Порядок guard'ов: аутентификация → роль и членство → лимит (ключ — пользователь).
        { provide: APP_GUARD, useExisting: AuthGuard },
        { provide: APP_GUARD, useExisting: AccessGuard },
        { provide: APP_GUARD, useClass: RateLimitGuard },
      ],
      exports: [ENV],
    };
  }
}
