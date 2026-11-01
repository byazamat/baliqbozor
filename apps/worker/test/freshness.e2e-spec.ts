import { truncateAll } from '@baliqbozor/db/testing';
import { Logger } from '@nestjs/common';

import { loadEnv } from '../src/config/env.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { FreshnessService } from '../src/listings/freshness.service.js';
import { NotificationHandlers } from '../src/notifications/notification.handlers.js';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher.js';
import { OutboxPoller } from '../src/outbox/outbox.poller.js';
import { PrismaOutboxSource } from '../src/outbox/prisma-outbox.source.js';

Logger.overrideLogger(false);

const DAY = 86_400_000;
/** 11:00 по Ташкенту — рабочие часы. */
const NOW = new Date('2026-11-10T06:00:00Z');

describe('listing freshness (e2e): reminder, auto-pause, expiry, notifications', () => {
  const env = loadEnv();
  const prisma = new PrismaService(env);
  const freshness = new FreshnessService(prisma);
  let poller: OutboxPoller;

  beforeAll(() => {
    const dispatcher = new OutboxDispatcher();
    new NotificationHandlers(dispatcher, { send: () => Promise.resolve() }, env).onModuleInit();
    poller = new OutboxPoller(new PrismaOutboxSource(prisma), dispatcher.handle, {
      intervalMs: 1000,
      batchSize: 50,
    });
  });
  beforeEach(async () => {
    await truncateAll(prisma.client);
  });
  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const db = () => prisma.client;

  async function world() {
    const user = (phone: string, locale: 'uz' | 'ru') =>
      db().user.create({ data: { phone, locale } });
    const owner = await user('+998901100001', 'ru');
    const manager = await user('+998901100002', 'uz');
    const staff = await user('+998901100003', 'ru');
    const org = await db().organization.create({
      data: {
        type: 'SELLER',
        legalForm: 'LLC',
        name: 'Zarafshon',
        verificationStatus: 'VERIFIED',
        members: {
          create: [
            { userId: owner.id, role: 'OWNER' },
            { userId: manager.id, role: 'MANAGER' },
            { userId: staff.id, role: 'STAFF' },
          ],
        },
      },
    });
    const region = await db().region.create({
      data: { code: 'SAMARKAND', nameUz: 'Samarqand', nameRu: 'Самарканд' },
    });
    const farm = await db().farm.create({
      data: {
        sellerOrgId: org.id,
        name: 'F',
        regionId: region.id,
        lat: 39.65,
        lng: 66.96,
        waterBodyTypes: ['POND'],
      },
    });
    const species = await db().fishSpecies.create({
      data: { code: 'SILVER_CARP', nameUz: 'Do‘ngpeshona', nameRu: 'Толстолобик' },
    });
    const size = await db().sizeClass.create({
      data: {
        speciesId: species.id,
        code: '1-2',
        labelUz: '1–2 kg',
        labelRu: '1–2 кг',
        minKg: 1,
        maxKg: 2,
      },
    });
    const listing = (over: {
      lastConfirmedAt?: Date;
      availableTo?: Date | null;
      status?: 'ACTIVE' | 'PAUSED';
    }) =>
      db().listing.create({
        data: {
          sellerOrgId: org.id,
          farmId: farm.id,
          speciesId: species.id,
          sizeClassId: size.id,
          form: 'LIVE',
          volumeKg: 2000,
          reservedKg: 500,
          minOrderKg: 100,
          priceType: 'FIXED',
          pricePerKg: 26000n,
          availableFrom: new Date('2026-11-01'),
          availableTo: null,
          status: 'ACTIVE',
          publishedAt: new Date('2026-11-01'),
          createdById: owner.id,
          ...over,
        },
      });
    return { owner, manager, staff, listing };
  }

  const inbox = (userId: string) =>
    db().notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  it('scenario 14.3 #4: reminder a day before, auto-pause after 7 days, notifications to the right members', async () => {
    const w = await world();
    const l = await w.listing({ lastConfirmedAt: new Date(NOW.getTime() - 6.5 * DAY) });
    const fresh = await w.listing({ lastConfirmedAt: new Date(NOW.getTime() - 2 * DAY) });

    // 22:00 по Ташкенту — напоминаний нет (тихие часы)
    expect(await freshness.run(new Date('2026-11-10T17:00:00Z'))).toEqual({
      expired: 0,
      autoPaused: 0,
      reminded: 0,
    });

    expect(await freshness.run(NOW)).toEqual({ expired: 0, autoPaused: 0, reminded: 1 });
    expect(await freshness.run(NOW)).toEqual({ expired: 0, autoPaused: 0, reminded: 0 });
    expect(
      (await db().listing.findUniqueOrThrow({ where: { id: l.id } })).freshnessRemindedAt,
    ).toEqual(NOW);
    expect(await poller.tick()).toBe(1);
    const [reminderRu] = await inbox(w.owner.id);
    expect(reminderRu).toMatchObject({
      eventType: 'listing.freshness_reminder',
      title: 'Подтвердите наличие',
    });
    expect(reminderRu?.body).toContain(
      'Толстолобик, 1–2 кг: 1\u00a0500\u00a0кг. Подтвердите до 10.11.2026 23:00',
    );
    expect(reminderRu?.data).toEqual({ listingId: l.id, orgId: expect.any(String) });
    expect((await inbox(w.manager.id))[0]?.title).toBe('Mavjudlikni tasdiqlang');
    expect(await inbox(w.staff.id)).toHaveLength(1);

    const later = new Date(NOW.getTime() + DAY);
    expect(await freshness.run(later)).toEqual({ expired: 0, autoPaused: 1, reminded: 0 });
    expect(await db().listing.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({
      status: 'PAUSED',
      pauseReason: 'FRESHNESS',
    });
    expect((await db().listing.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe(
      'ACTIVE',
    );
    expect(await poller.tick()).toBe(2); // status_changed + auto_paused
    expect((await inbox(w.owner.id)).map((n) => n.eventType)).toEqual([
      'listing.freshness_reminder',
      'listing.auto_paused',
    ]);
    expect((await inbox(w.owner.id))[1]?.body).toContain('7 дн.');
    expect(await inbox(w.staff.id)).toHaveLength(1); // автопауза — только OWNER/MANAGER
    expect(await freshness.run(later)).toEqual({ expired: 0, autoPaused: 0, reminded: 0 });
  });

  it('expires listings whose window ended by the Tashkent date', async () => {
    const w = await world();
    const ended = await w.listing({ availableTo: new Date('2026-11-09'), lastConfirmedAt: NOW });
    const paused = await w.listing({
      availableTo: new Date('2026-11-09'),
      status: 'PAUSED',
      lastConfirmedAt: NOW,
    });
    const today = await w.listing({ availableTo: new Date('2026-11-10'), lastConfirmedAt: NOW });
    expect(await freshness.run(NOW)).toEqual({ expired: 2, autoPaused: 0, reminded: 0 });
    for (const id of [ended.id, paused.id]) {
      expect((await db().listing.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    }
    expect((await db().listing.findUniqueOrThrow({ where: { id: today.id } })).status).toBe(
      'ACTIVE',
    );
    // 2026-11-10 19:00 UTC — уже 11-е в Ташкенте
    expect((await freshness.run(new Date('2026-11-10T19:00:00Z'))).expired).toBe(1);
    await poller.tick();
    expect(
      (await inbox(w.manager.id)).filter((n) => n.eventType === 'listing.expired'),
    ).toHaveLength(3);
  });
});
