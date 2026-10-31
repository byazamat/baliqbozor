import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';
import { InMemoryStorageProvider } from '../src/providers/storage/in-memory-storage.provider.js';
import { STORAGE_PROVIDER } from '../src/providers/storage/storage.provider.js';
import { createTestApp } from './create-test-app.js';

describe('health (e2e, real Postgres/Redis/MinIO)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 outside /api/v1', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'api' });
    expect(typeof res.body.uptimeSec).toBe('number');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /ready → 200 when database, redis and storage are up', async () => {
    const res = await request(app.getHttpServer()).get('/ready').expect(200);
    expect(res.body.status).toBe('ok');
    for (const check of ['database', 'redis', 'storage']) {
      expect(res.body.checks[check]).toMatchObject({ status: 'up' });
    }
  });

  it('health endpoints are not duplicated under the prefix', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(404);
  });
});

describe('ready (e2e, dependencies down)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        {
          token: PrismaService,
          value: {
            ping: () => Promise.reject(new Error('db down')),
            onModuleDestroy: () => undefined,
          },
        },
        {
          token: RedisService,
          value: {
            ping: () => new Promise<void>(() => undefined),
            onModuleDestroy: () => undefined,
          },
        },
        { token: STORAGE_PROVIDER, value: new InMemoryStorageProvider(false) },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ready → 503 with per-check status', async () => {
    const res = await request(app.getHttpServer()).get('/ready').expect(503);
    expect(res.body).toMatchObject({
      status: 'error',
      checks: {
        database: { status: 'down', error: 'db down' },
        redis: { status: 'down', error: 'timeout' },
        storage: { status: 'down', error: 'storage unavailable' },
      },
    });
  });

  it('GET /health stays 200 when dependencies are down', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
