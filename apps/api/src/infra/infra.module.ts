import { Global, Module } from '@nestjs/common';

import { S3StorageProvider } from '../providers/storage/s3-storage.provider.js';
import { STORAGE_PROVIDER } from '../providers/storage/storage.provider.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    { provide: STORAGE_PROVIDER, useClass: S3StorageProvider },
  ],
  exports: [PrismaService, RedisService, STORAGE_PROVIDER],
})
export class InfraModule {}
