import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import { ENV, type Env } from '../../config/env.js';
import type { StorageProvider } from './storage.provider.js';

@Injectable()
export class S3StorageProvider implements StorageProvider, OnModuleDestroy {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      maxAttempts: 1,
    });
  }

  async checkHealth(signal?: AbortSignal): Promise<void> {
    await this.s3.send(
      new HeadBucketCommand({ Bucket: this.bucket }),
      signal ? { abortSignal: signal } : {},
    );
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}
