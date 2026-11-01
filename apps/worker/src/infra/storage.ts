import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';

import { ENV, type Env } from '../config/env.js';

/** Хранилище для worker: чтение загрузок и запись обработанных копий (D-52). */
export interface WorkerStorage {
  get(key: string): Promise<Buffer>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const WORKER_STORAGE = Symbol('WORKER_STORAGE');

@Injectable()
export class S3WorkerStorage implements WorkerStorage, OnModuleDestroy {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    this.bucket = env.S3_BUCKET;
    this.s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty object ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  onModuleDestroy(): void {
    this.s3.destroy();
  }
}

@Global()
@Module({
  providers: [{ provide: WORKER_STORAGE, useClass: S3WorkerStorage }],
  exports: [WORKER_STORAGE],
})
export class StorageModule {}
