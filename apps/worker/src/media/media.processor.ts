import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { WORKER_STORAGE, type WorkerStorage } from '../infra/storage.js';
import { resolveFfmpeg } from './ffmpeg.js';
import { MEDIA_QUEUE } from './media.constants.js';
import { processMedia } from './media.pipeline.js';

export interface MediaJob {
  mediaId: string;
}

/**
 * Обработка загруженного файла (D-52). Очищенная копия пишется под новым ключом, а оригинал
 * удаляется: presigned PUT действует ещё 10 минут и не должен подменить проверенный файл.
 */
@Processor(MEDIA_QUEUE, { concurrency: 2 })
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WORKER_STORAGE) private readonly storage: WorkerStorage,
    @Inject(ENV) private readonly env: Env,
  ) {
    super();
  }

  async process(job: Job<MediaJob>): Promise<{ status: string }> {
    const media = await this.prisma.client.mediaFile.findUnique({
      where: { id: job.data.mediaId },
    });
    if (!media || media.status !== 'UPLOADED') return { status: 'skipped' };

    const input = await this.storage.get(media.storageKey);
    const result = await processMedia(input, media.kind, () => resolveFfmpeg(this.env.FFMPEG_PATH));
    if (!result.ok) {
      await this.storage.delete(media.storageKey);
      await this.prisma.client.mediaFile.updateMany({
        where: { id: media.id, status: 'UPLOADED' },
        data: { status: 'REJECTED', rejectReason: result.reason },
      });
      this.logger.warn(`media ${media.id} rejected: ${result.reason}`);
      return { status: 'REJECTED' };
    }

    const key = `${media.storageKey}.processed`;
    await this.storage.put(key, result.body, result.mimeType);
    const thumbnailKey = result.thumbnail ? `${media.storageKey}.thumb.webp` : null;
    if (result.thumbnail && thumbnailKey) {
      await this.storage.put(thumbnailKey, result.thumbnail, 'image/webp');
    }
    await this.prisma.client.mediaFile.updateMany({
      where: { id: media.id, status: 'UPLOADED' },
      data: {
        status: 'PROCESSED',
        storageKey: key,
        mimeType: result.mimeType,
        sizeBytes: result.body.length,
        width: result.width,
        height: result.height,
        durationSec: result.durationSec,
        thumbnailKey,
      },
    });
    await this.storage.delete(media.storageKey);
    return { status: 'PROCESSED' };
  }
}
