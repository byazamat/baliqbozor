import {
  DEMO_ORGS,
  DEMO_USERS,
  demoPhone,
  grantPlatformRole,
  seedDemo,
  seedReference,
} from '@baliqbozor/db/seed';
import { SETTING_KEYS } from '@baliqbozor/domain';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms, loginAs } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';

describe('seed and admin:grant (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: SMS_PROVIDER, value: sms }] });
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it('seeds reference data idempotently and keeps admin-changed settings', async () => {
    const prisma = prismaOf(app);
    const first = await seedReference(prisma);
    expect(first).toEqual({
      regions: 14,
      species: 9,
      sizeClasses: 32,
      settingsCreated: SETTING_KEYS.length,
    });
    await prisma.setting.update({
      where: { key: 'commission.defaultRateBps' },
      data: { value: 150 },
    });
    const second = await seedReference(prisma);
    expect(second.settingsCreated).toBe(0);
    expect(await prisma.region.count()).toBe(14);
    expect(await prisma.fishSpecies.count()).toBe(9);
    expect(await prisma.sizeClass.count()).toBe(32);
    expect(
      (await prisma.setting.findUniqueOrThrow({ where: { key: 'commission.defaultRateBps' } }))
        .value,
    ).toBe(150);

    const trout = await prisma.fishSpecies.findUniqueOrThrow({
      where: { code: 'RAINBOW_TROUT' },
      include: { sizeClasses: { orderBy: { sort: 'asc' } } },
    });
    expect(trout.sizeClasses.map((c) => [c.code, c.labelRu, c.maxKg?.toFixed(1) ?? null])).toEqual([
      ['0.25-0.4', '0,25–0,4 кг', '0.4'],
      ['0.4-0.7', '0,4–0,7 кг', '0.7'],
      ['0.7+', 'от 0,7 кг', null],
    ]);

    // Справочники доступны публичному API в порядке показа.
    const regions = await request(app.getHttpServer()).get('/api/v1/dict/regions').expect(200);
    expect(regions.body[0]).toMatchObject({ code: 'TASHKENT_CITY', nameUz: 'Toshkent shahri' });
  });

  it('seeds demo users and organizations idempotently; demo owner can sign in', async () => {
    const prisma = prismaOf(app);
    await seedReference(prisma);
    await seedDemo(prisma);
    await seedDemo(prisma);
    expect(await prisma.user.count()).toBe(DEMO_USERS.length);
    expect(await prisma.organization.count()).toBe(DEMO_ORGS.length);
    expect(await prisma.membership.count({ where: { role: 'OWNER' } })).toBe(DEMO_ORGS.length);
    const byType = await prisma.organization.groupBy({ by: ['type'], _count: true });
    expect(Object.fromEntries(byType.map((g) => [g.type, g._count]))).toEqual({
      SELLER: 3,
      BUYER: 3,
      CARRIER: 2,
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { phone: demoPhone(1) } })).platformRole,
    ).toBe('OPERATOR');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { phone: demoPhone(2) } })).platformRole,
    ).toBe('ADMIN');

    const seller = await loginAs(app, sms, demoPhone(3));
    const me = await request(app.getHttpServer()).get('/api/v1/me').set(bearer(seller)).expect(200);
    expect(me.body.organizations).toEqual([
      expect.objectContaining({ name: 'Samarqand Baliq', role: 'OWNER', type: 'SELLER' }),
    ]);
  });

  it('grants and revokes platform roles with an audit record', async () => {
    const prisma = prismaOf(app);
    const created = await grantPlatformRole(prisma, '+998 93 555 44 33', 'admin');
    expect(created).toMatchObject({
      phone: '+998935554433',
      before: null,
      after: 'ADMIN',
      created: true,
    });
    const revoked = await grantPlatformRole(prisma, '935554433', 'USER');
    expect(revoked).toMatchObject({ before: 'ADMIN', after: 'USER', created: false });

    const audit = await prisma.auditLog.findMany({
      where: { entityId: created.userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => [a.action, a.actorRole, a.after])).toEqual([
      ['user.platformRole.grant', 'CLI', { platformRole: 'ADMIN' }],
      ['user.platformRole.grant', 'CLI', { platformRole: 'USER' }],
    ]);

    await expect(grantPlatformRole(prisma, '12345', 'ADMIN')).rejects.toThrow(/phone/);
    await expect(grantPlatformRole(prisma, '+998935554433', 'ROOT')).rejects.toThrow(/Role/);
  });
});
