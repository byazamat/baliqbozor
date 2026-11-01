import { tashkentDate } from '@baliqbozor/domain';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SettingsService } from '../src/modules/settings/settings.service.js';
import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addFarm, addListingMedia, addSpecies, createOrg } from './fixtures.js';

const DAY = 24 * 60 * 60 * 1000;
const date = (days: number) => tashkentDate(new Date(Date.now() + days * DAY));

describe('matching and notifications on open (e2e)', () => {
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

  const http = () => request(app.getHttpServer());
  const as = (who: { accessToken: string }, orgId?: string) => {
    const h = (t: request.Test) =>
      orgId ? t.set(bearer(who)).set('X-Org-Id', orgId) : t.set(bearer(who));
    return {
      get: (p: string) => h(http().get(`/api/v1${p}`)),
      post: (p: string, d: object = {}) => h(http().post(`/api/v1${p}`)).send(d),
    };
  };

  /** Сценарий 1 SPEC 14.3: S1 Самарканд 2 т по 26 000, S2 Джизак 1 т по 25 000; S3 — Хорезм, далеко. */
  async function world() {
    const prisma = prismaOf(app);
    const { species, size } = await addSpecies(app);
    const seller = async (
      name: string,
      region: string,
      lat: string,
      lng: string,
      volumeKg: number,
      price: bigint,
    ) => {
      const owner = await actor(app, sms);
      const org = await createOrg(app, owner.userId, { status: 'VERIFIED', name });
      const farm = await addFarm(app, org.id, { lat, lng, regionCode: region });
      const listing = await prisma.listing.create({
        data: {
          sellerOrgId: org.id,
          farmId: farm.id,
          speciesId: species.id,
          sizeClassId: size.id,
          form: 'LIVE',
          volumeKg,
          minOrderKg: 100,
          priceType: 'FIXED',
          pricePerKg: price,
          availableFrom: new Date(date(0)),
          availableTo: new Date(date(30)),
          status: 'ACTIVE',
          lastConfirmedAt: new Date(),
          createdById: owner.userId,
        },
      });
      return { owner, org, farm, listing };
    };
    const s1 = await seller('S1', 'SAMARKAND', '39.654200', '66.959700', 2000, 26_000n);
    const s2 = await seller('S2', 'JIZZAKH', '40.115800', '67.842200', 1000, 25_000n);
    const s3 = await seller('S3', 'KHOREZM', '41.550000', '60.630000', 3000, 20_000n);
    const bOwner = await actor(app, sms);
    const bOrg = await createOrg(app, bOwner.userId, {
      type: 'BUYER',
      status: 'VERIFIED',
      name: 'Restoran B',
    });
    const region = await prisma.region.create({
      data: { code: 'TASHKENT_CITY', nameUz: 'Toshkent', nameRu: 'Ташкент' },
    });
    const address = await prisma.address.create({
      data: {
        orgId: bOrg.id,
        label: 'B',
        addressText: 'Chilonzor',
        regionId: region.id,
        lat: '41.299500',
        lng: '69.240100',
      },
    });
    const buyerApi = as(bOwner, bOrg.id);
    const open = async (over: object = {}) => {
      const id = (
        await buyerApi
          .post('/requests', {
            speciesId: species.id,
            sizeClassId: size.id,
            form: 'LIVE',
            volumeKg: '2500',
            deliveryAddressId: address.id,
            deliveryDateFrom: date(2),
            deliveryDateTo: date(4),
            targetPricePerKg: '26000',
            radiusKm: 350,
            ...over,
          })
          .expect(201)
      ).body.id as string;
      await buyerApi.post(`/requests/${id}/submit`).expect(200);
      return id;
    };
    return { s1, s2, s3, species, size, buyerApi, bOwner, bOrg, open };
  }

  it('notifies matching sellers once when a request opens; shows candidates and a split', async () => {
    const w = await world();
    const prisma = prismaOf(app);
    const id = await w.open();
    const notified = await prisma.requestNotification.findMany({ where: { requestId: id } });
    expect(notified.map((n) => n.sellerOrgId).sort()).toEqual([w.s1.org.id, w.s2.org.id].sort());
    const matched = await prisma.domainEvent.findFirstOrThrow({
      where: { type: 'request.matched', aggregateId: id },
    });
    expect((matched.payload as { sellerOrgIds: string[] }).sellerOrgIds).toHaveLength(2);

    const c = await w.buyerApi.get(`/requests/${id}/candidates`).expect(200);
    expect((c.body.items as { listingId: string }[]).map((i) => i.listingId)).toEqual([
      w.s2.listing.id,
      w.s1.listing.id,
    ]);
    expect(c.body.items[0]).toMatchObject({
      sellerName: null,
      farmName: null,
      region: { code: 'JIZZAKH' },
      distanceKm: 180,
    });
    expect(c.body.suggestedSplit).toEqual({
      lines: [
        { listingId: w.s2.listing.id, volumeKg: '1000.000' },
        { listingId: w.s1.listing.id, volumeKg: '1500.000' },
      ],
      coveredKg: '2500.000',
      complete: true,
    });

    const operator = await actor(app, sms, 'OPERATOR');
    const staffView = await as(operator).get(`/admin/requests/${id}/candidates`).expect(200);
    expect(staffView.body.items[0]).toMatchObject({ sellerName: 'S2', sellerOrgId: w.s2.org.id });

    // приглашение вне радиуса: один раз, только O/A
    await w.buyerApi.post(`/admin/requests/${id}/invite`, { sellerOrgId: w.s3.org.id }).expect(403);
    await as(operator)
      .post(`/admin/requests/${id}/invite`, { sellerOrgId: w.s3.org.id })
      .expect(204);
    await as(operator)
      .post(`/admin/requests/${id}/invite`, { sellerOrgId: w.s3.org.id })
      .expect(409);
    expect(
      await prisma.requestNotification.findFirstOrThrow({
        where: { requestId: id, sellerOrgId: w.s3.org.id },
      }),
    ).toMatchObject({ invitedById: operator.userId });
  });

  it('respects matching.maxNotify and notifies a seller whose listing goes live later', async () => {
    const w = await world();
    const prisma = prismaOf(app);
    await prisma.setting.create({ data: { key: 'matching.maxNotify', value: 1 } });
    // кэш настроек сбрасывается изменением через админку; здесь — напрямую
    await app.get(SettingsService).invalidate();
    await prisma.listing.update({
      where: { id: w.s1.listing.id },
      data: { status: 'PAUSED', pauseReason: 'MANUAL' },
    });
    const id = await w.open();
    expect(
      (await prisma.requestNotification.findMany({ where: { requestId: id } })).map(
        (n) => n.sellerOrgId,
      ),
    ).toEqual([w.s2.org.id]);

    // лимит 1 исчерпан: S1 возвращает позицию в продажу — без уведомления
    await addListingMedia(app, w.s1.org.id, w.s1.owner.userId, { listingId: w.s1.listing.id });
    await as(w.s1.owner, w.s1.org.id).post(`/listings/${w.s1.listing.id}/resume`).expect(200);
    expect(await prisma.requestNotification.count({ where: { requestId: id } })).toBe(1);

    await prisma.setting.update({ where: { key: 'matching.maxNotify' }, data: { value: 20 } });
    await prisma.listing.update({
      where: { id: w.s1.listing.id },
      data: { status: 'PAUSED', pauseReason: 'MANUAL' },
    });
    await app.get(SettingsService).invalidate();
    await as(w.s1.owner, w.s1.org.id).post(`/listings/${w.s1.listing.id}/resume`).expect(200);
    expect(
      (await prisma.requestNotification.findMany({ where: { requestId: id } }))
        .map((n) => n.sellerOrgId)
        .sort(),
    ).toEqual([w.s1.org.id, w.s2.org.id].sort());
    await as(w.s1.owner, w.s1.org.id).post(`/listings/${w.s1.listing.id}/pause`).expect(200);
    await as(w.s1.owner, w.s1.org.id).post(`/listings/${w.s1.listing.id}/resume`).expect(200);
    expect(await prisma.requestNotification.count({ where: { requestId: id } })).toBe(2);
  });

  it('a request on review notifies nobody until the operator approves it', async () => {
    const w = await world();
    const prisma = prismaOf(app);
    await prisma.organization.update({
      where: { id: w.bOrg.id },
      data: { verificationStatus: 'UNVERIFIED' },
    });
    const id = await w.open();
    expect(await prisma.requestNotification.count({ where: { requestId: id } })).toBe(0);
    const operator = await actor(app, sms, 'OPERATOR');
    await as(operator).post(`/admin/requests/${id}/approve`).expect(200);
    expect(await prisma.requestNotification.count({ where: { requestId: id } })).toBe(2);
    // чужой покупатель кандидатов не видит
    const other = await actor(app, sms);
    const otherOrg = await createOrg(app, other.userId, { type: 'BUYER' });
    await as(other, otherOrg.id).get(`/requests/${id}/candidates`).expect(404);
  });
});
