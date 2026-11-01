import { Module } from '@nestjs/common';

import { OrgsModule } from '../orgs/orgs.module.js';
import { AdminVerificationController, VerificationController } from './verification.controller.js';
import { VerificationService } from './verification.service.js';

@Module({
  imports: [OrgsModule],
  controllers: [VerificationController, AdminVerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
