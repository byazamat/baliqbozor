import { Module } from '@nestjs/common';

import { MatchingModule } from '../matching/matching.module.js';
import { AdminRequestsController, RequestsController } from './requests.controller.js';
import { RequestsService } from './requests.service.js';

@Module({
  imports: [MatchingModule],
  controllers: [RequestsController, AdminRequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
