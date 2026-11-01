import { Global, Module } from '@nestjs/common';

import { ConsoleSmsProvider } from '../../providers/sms/console-sms.provider.js';
import { SMS_PROVIDER } from '../../providers/sms/sms.provider.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    AuthGuard,
    { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider },
  ],
  exports: [TokenService, AuthGuard, SMS_PROVIDER],
})
export class AuthModule {}
