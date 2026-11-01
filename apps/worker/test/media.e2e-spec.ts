import { randomUUID } from 'node:crypto';

import { truncateAll } from '@baliqbozor/db/testing';
import type { INestApplicationContext } from '@nestjs/common';
import sharp from 'sharp';

import { createWorker } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { WORKER_STORAGE, type WorkerStorage } from '../src/infra/storage.js';

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs = 15_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe('media processing (e2e, real Postgres/Redis/MinIO)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let storage: WorkerStorage;

  beforeAll(async () => {
    app = await createWorker(
      loadEnv({ ...process.env, WORKER_HEALTH_PORT: '0', OUTBOX_POLL_INTERVAL_MS: '200' }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    storage = app.get(WORKER_STORAGE);
  });
  beforeEach(async () => {
    await truncateAll(prisma.client);
  });
  afterAll(async () => {
    await app.close();
  });

  /** Как после `POST /media/:id/complete`: объект в бакете, файл UPLOADED, событие в outbox. */
  async function uploaded(body: Buffer, kind: 'IMAGE' | 'VIDEO', mimeType: string) {
    const user = await prisma.client.user.create({
      data: { phone: `+99890${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}` },
    });
    const id = randomUUID();
    const storageKey = `listing_media/test/${id}`;
    await storage.put(storageKey, body, mimeType);
    await prisma.client.mediaFile.create({
      data: {
        id,
        uploaderId: user.id,
        kind,
        status: 'UPLOADED',
        purpose: 'LISTING_MEDIA',
        mimeType,
        sizeBytes: body.length,
        storageKey,
      },
    });
    await prisma.client.domainEvent.create({
      data: {
        type: 'media.uploaded',
        aggregateType: 'MediaFile',
        aggregateId: id,
        payload: { mediaId: id },
      },
    });
    return { id, storageKey };
  }

  const settled = (id: string) =>
    waitFor(async () => {
      const m = await prisma.client.mediaFile.findUniqueOrThrow({ where: { id } });
      return m.status === 'PROCESSED' || m.status === 'REJECTED' ? m : null;
    });

  it('replaces a photo with a clean copy and a thumbnail; the original is gone', async () => {
    const jpeg = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#28a' },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'GeoPhone' }, IFD3: { GPSLatitudeRef: 'N' } })
      .toBuffer();
    const { id, storageKey } = await uploaded(jpeg, 'IMAGE', 'image/png');
    const media = await settled(id);
    expect(media).toMatchObject({
      status: 'PROCESSED',
      mimeType: 'image/jpeg',
      width: 1200,
      height: 900,
      storageKey: `${storageKey}.processed`,
      thumbnailKey: `${storageKey}.thumb.webp`,
    });
    const clean = await storage.get(media.storageKey);
    expect(clean.length).toBe(media.sizeBytes);
    expect((await sharp(clean).metadata()).exif).toBeUndefined();
    expect((await sharp(await storage.get(`${storageKey}.thumb.webp`)).metadata()).format).toBe(
      'webp',
    );
    await expect(storage.get(storageKey)).rejects.toThrow();
  });

  it('rejects a file whose content does not match the declared kind', async () => {
    const { id, storageKey } = await uploaded(
      Buffer.from('%PDF-1.4\n%%EOF'),
      'IMAGE',
      'image/jpeg',
    );
    expect(await settled(id)).toMatchObject({ status: 'REJECTED', rejectReason: 'TYPE_MISMATCH' });
    await expect(storage.get(storageKey)).rejects.toThrow();
  });
});
