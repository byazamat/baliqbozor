import {
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import { ENV, type Env } from '../../config/env.js';
import type { PresignedUpload, StorageProvider, StoredObject } from './storage.provider.js';

/**
 * S3-совместимое хранилище (MinIO локально). Подписи для браузера делает отдельный клиент
 * с публичным адресом (`S3_PUBLIC_ENDPOINT`), внутренние запросы — клиент с `S3_ENDPOINT`.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider, OnModuleDestroy {
  private readonly s3: S3Client;
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    const common = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    };
    this.s3 = new S3Client({ ...common, endpoint: env.S3_ENDPOINT, maxAttempts: 1 });
    this.signer = new S3Client({ ...common, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
  }

  async checkHealth(signal?: AbortSignal): Promise<void> {
    await this.s3.send(
      new HeadBucketCommand({ Bucket: this.bucket }),
      signal ? { abortSignal: signal } : {},
    );
  }

  async presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSec: number,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    });
    // content-length входит в подпись: файл другого размера хранилище не примет.
    const url = await getSignedUrl(this.signer, command, {
      expiresIn: expiresInSec,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
    return {
      url,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
    };
  }

  presignGet(key: string, expiresInSec: number): Promise<string> {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSec,
    });
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
      throw err;
    }
  }

  onModuleDestroy(): void {
    this.s3.destroy();
    this.signer.destroy();
  }
}
