import { Public } from '../src/modules/auth/public.decorator.js';
import { defaultSettings } from '@baliqbozor/domain';
import { Controller, Get, Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import request from 'supertest';

import { runWithRequest } from '../src/common/request-context.js';
import { AuditService } from '../src/infra/audit.service.js';
import { recordEvent } from '../src/infra/events.js';
import { RedisService } from '../src/infra/redis.service.js';
import { SETTINGS_CACHE_KEY, SettingsService } from '../src/modules/settings/settings.service.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';

describe('API infrastructure (e2e, real Postgres/Redis)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('settings', () => {
    it('returns defaults on an empty database and caches them', async () => {
      const settings = app.get(SettingsService);
      expect(await settings.all()).toEqual(defaultSettings());
      const redis = await app.get(RedisService).ready();
      expect(await redis.exists(SETTINGS_CACHE_KEY)).toBe(1);
    });

    it('serves cached values until invalidated', async () => {
      const settings = app.get(SettingsService);
      await settings.all();
      await prismaOf(app).setting.create({ data: { key: 'order.minOrderKg', value: 250 } });
      expect(await settings.get('order.minOrderKg')).toBe(100);
      await settings.invalidate();
      expect(await settings.get('order.minOrderKg')).toBe(250);
    });

    it('ignores invalid stored values', async () => {
      await prismaOf(app).setting.create({ data: { key: 'otp.maxAttempts', value: 'many' } });
      expect(await app.get(SettingsService).get('otp.maxAttempts')).toBe(5);
    });

    it('updates a value with audit and fresh cache', async () => {
      const settings = app.get(SettingsService);
      await settings.all();
      await settings.update('commission.defaultRateBps', 250);
      expect(await settings.get('commission.defaultRateBps')).toBe(250);
      const audit = await prismaOf(app).auditLog.findFirstOrThrow({
        where: { action: 'settings.update', entityId: 'commission.defaultRateBps' },
      });
      expect(audit).toMatchObject({ before: 200, after: 250, actorRole: 'SYSTEM' });
    });

    it('rejects invalid values with VALIDATION_FAILED and keeps the old one', async () => {
      const settings = app.get(SettingsService);
      await expect(settings.update('commission.defaultRateBps', 20_000)).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { key: 'commission.defaultRateBps' },
      });
      expect(await settings.get('commission.defaultRateBps')).toBe(200);
      expect(await prismaOf(app).auditLog.count()).toBe(0);
    });
  });

  describe('audit', () => {
    it('records actor, ip, user agent and serializes BigInt', async () => {
      const req = {
        ip: '10.0.0.7',
        headers: { 'user-agent': 'e2e-agent' },
        auth: {
          userId: '00000000-0000-4000-8000-000000000001',
          platformRole: 'OPERATOR',
          sessionId: 's',
          org: { id: 'o', type: 'BUYER', role: 'OWNER' },
        },
      } as unknown as Request;
      await runWithRequest(req, () =>
        prismaOf(app).$transaction((tx) =>
          app.get(AuditService).record(tx, {
            action: 'org.verify',
            entityType: 'Organization',
            entityId: 'org-1',
            after: { amount: 12_345_678_901_234n },
          }),
        ),
      );
      expect(await prismaOf(app).auditLog.findFirstOrThrow()).toMatchObject({
        actorUserId: '00000000-0000-4000-8000-000000000001',
        actorRole: 'OPERATOR/OWNER',
        ip: '10.0.0.7',
        userAgent: 'e2e-agent',
        after: { amount: '12345678901234' },
      });
    });
  });

  describe('domain events (outbox)', () => {
    it('is written in the same transaction and rolled back with it', async () => {
      const prisma = prismaOf(app);
      await prisma.$transaction((tx) =>
        recordEvent(tx, 'org.created', 'org-1', {
          orgId: 'org-1',
          type: 'SELLER',
          createdById: 'u1',
        }),
      );
      await expect(
        prisma.$transaction(async (tx) => {
          await recordEvent(tx, 'org.created', 'org-2', {
            orgId: 'org-2',
            type: 'BUYER',
            createdById: 'u1',
          });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      const events = await prisma.domainEvent.findMany();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'org.created',
        aggregateType: 'Organization',
        aggregateId: 'org-1',
        processedAt: null,
        attempts: 0,
      });
    });
  });
});

@Public()
@Controller('test')
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

describe('rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ env: { RATE_LIMIT_PER_MINUTE: 3 }, extraModules: [PingModule] });
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it('allows N requests per minute, then answers 429 RATE_LIMITED; health is not counted', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 5; i += 1) await request(server).get('/health').expect(200);
    for (let i = 3; i > 0; i -= 1) {
      const res = await request(server).get('/api/v1/test/ping').expect(200);
      expect(res.headers['x-ratelimit-remaining']).toBe(String(i - 1));
    }
    const res = await request(server).get('/api/v1/test/ping').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body.error.details.retryAfterSec).toBeGreaterThan(0);
  });
});
