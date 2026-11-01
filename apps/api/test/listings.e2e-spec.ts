import { tashkentDate } from '@baliqbozor/domain';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import {
  actor,
  addFarm,
  addListingMedia,
  addMember,
  addSpecies,
  createOrg,
  expectIsolated,
} from './fixtures.js';

const DAY = 24 * 60 * 60 * 1000;
const date = (days: number) => tashkentDate(new Date(Date.now() + days * DAY));

describe('seller listings (e2e)', () => {
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
  const as = (who: { accessToken: string }, orgId: string) => ({
    get: (path: string) => http().get(`/api/v1${path}`).set(bearer(who)).set('X-Org-Id', orgId),
    post: (path: string, data: object = {}) =>
      http().post(`/api/v1${path}`).set(bearer(who)).set('X-Org-Id', orgId).send(data),
    patch: (path: string, data: object) =>
      http().patch(`/api/v1${path}`).set(bearer(who)).set('X-Org-Id', orgId).send(data),
  });

  async function seller(status: 'VERIFIED' | 'UNVERIFIED' = 'VERIFIED') {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId, { status });
    const farm = await addFarm(app, org.id);
    const { species, size } = await addSpecies(app);
    const body = (over: object = {}) => ({
      farmId: farm.id,
      speciesId: species.id,
      sizeClassId: size.id,
      form: 'LIVE',
      kind: 'AVAILABLE_NOW',
      volumeKg: '2000',
      priceType: 'FIXED',
      pricePerKg: '26000',
      availableFrom: date(1),
      availableTo: date(30),
      ...over,
    });
    return { owner, org, farm, species, size, body, api: as(owner, org.id) };
  }

  const fields = (res: request.Response) =>
    (res.body.error.details.fields as { field: string; constraints: string[] }[]).map(
      (f) => `${f.field}:${f.constraints.join(',')}`,
    );

  it('creates a draft, publishes with a processed photo, pauses, resumes and archives', async () => {
    const s = await seller();
    const draft = await s.api.post('/listings', s.body()).expect(201);
    expect(draft.body).toMatchObject({
      status: 'DRAFT',
      volumeKg: '2000.000',
      availableKg: '2000.000',
      minOrderKg: '100.000',
      pricePerKg: '26000',
      farm: { id: s.farm.id, isActive: true },
      species: { code: 'SILVER_CARP' },
      lastConfirmedAt: null,
      freshnessDueAt: null,
    });
    const id = draft.body.id as string;

    expect(fields(await s.api.post(`/listings/${id}/publish`).expect(400))).toEqual([
      'mediaIds:photoRequired',
    ]);
    const pending = await addListingMedia(app, s.org.id, s.owner.userId, { status: 'UPLOADED' });
    const video = await addListingMedia(app, s.org.id, s.owner.userId, { kind: 'VIDEO' });
    await s.api.patch(`/listings/${id}`, { mediaIds: [pending.id, video.id] }).expect(200);
    expect(fields(await s.api.post(`/listings/${id}/publish`).expect(400))).toEqual([
      'mediaIds:photoRequired',
    ]);
    const photo = await addListingMedia(app, s.org.id, s.owner.userId);
    await s.api.patch(`/listings/${id}`, { mediaIds: [photo.id, video.id] }).expect(200);

    const published = await s.api.post(`/listings/${id}/publish`).expect(200);
    expect(published.body).toMatchObject({ status: 'ACTIVE', hasVideo: true, pauseReason: null });
    expect(published.body.lastConfirmedAt).not.toBeNull();
    expect(
      new Date(published.body.freshnessDueAt as string).getTime() -
        new Date(published.body.lastConfirmedAt as string).getTime(),
    ).toBe(7 * DAY);
    expect((published.body.media as { id: string }[]).map((m) => m.id)).toEqual([
      photo.id,
      video.id,
    ]);

    await s.api.post(`/listings/${id}/publish`).expect(409);
    expect((await s.api.post(`/listings/${id}/pause`).expect(200)).body).toMatchObject({
      status: 'PAUSED',
      pauseReason: 'MANUAL',
    });
    await s.api.post(`/listings/${id}/pause`).expect(409);
    expect((await s.api.post(`/listings/${id}/resume`).expect(200)).body.status).toBe('ACTIVE');
    expect((await s.api.post(`/listings/${id}/archive`).expect(200)).body.status).toBe('ARCHIVED');
    await s.api.patch(`/listings/${id}`, { description: 'x' }).expect(409);

    const prisma = prismaOf(app);
    const events = await prisma.domainEvent.findMany({
      where: { aggregateId: id, type: 'listing.status_changed' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => (e.payload as { to: string }).to)).toEqual([
      'ACTIVE',
      'PAUSED',
      'ACTIVE',
      'ARCHIVED',
    ]);
    expect(
      await prisma.auditLog.count({ where: { entityId: id, action: { startsWith: 'listing.' } } }),
    ).toBe(7);
  });

  it('validates SPEC 8.3 terms, species and farm', async () => {
    const s = await seller();
    const bad = async (over: object) =>
      fields(await s.api.post('/listings', s.body(over)).expect(400));
    expect(await bad({ minOrderKg: '50' })).toEqual(['minOrderKg:min']);
    expect(await bad({ volumeKg: '80' })).toEqual(['volumeKg:gteMinOrder']);
    expect(await bad({ priceType: 'NEGOTIABLE' })).toEqual(['pricePerKg:mustBeEmpty']);
    expect(await bad({ pricePerKg: null })).toEqual(['pricePerKg:positive']);
    expect(await bad({ availableFrom: date(10), availableTo: null })).toEqual([
      'availableFrom:nowWindow',
    ]);
    expect(await bad({ kind: 'FUTURE_HARVEST', availableFrom: date(3) })).toEqual([
      'availableFrom:futureWindow',
    ]);
    expect(await bad({ availableTo: date(0) })).toEqual(['availableTo:afterFrom']);
    const other = await addSpecies(app, 'CARP');
    expect(await bad({ sizeClassId: other.size.id })).toEqual(['sizeClassId:matchesSpecies']);
    await prismaOf(app).farm.update({ where: { id: s.farm.id }, data: { isActive: false } });
    expect(await bad({})).toEqual(['farmId:farmActive']);
    await s.api.post('/listings', { ...s.body(), volumeKg: '12.3456' }).expect(400);

    await prismaOf(app).farm.update({ where: { id: s.farm.id }, data: { isActive: true } });
    const ok = await s.api
      .post(
        '/listings',
        s.body({
          priceType: 'NEGOTIABLE',
          pricePerKg: null,
          kind: 'FUTURE_HARVEST',
          availableFrom: date(40),
          availableTo: null,
        }),
      )
      .expect(201);
    expect(ok.body).toMatchObject({
      priceType: 'NEGOTIABLE',
      pricePerKg: null,
      kind: 'FUTURE_HARVEST',
    });
  });

  it('edits volumes with SOLD_OUT, committed volume, draft-only fields and freshness reset', async () => {
    const s = await seller();
    const photo = await addListingMedia(app, s.org.id, s.owner.userId);
    const id = (await s.api.post('/listings', s.body({ mediaIds: [photo.id] })).expect(201)).body
      .id as string;
    await s.api.post(`/listings/${id}/publish`).expect(200);
    const prisma = prismaOf(app);
    const old = new Date(Date.now() - 3 * DAY);
    await prisma.listing.update({
      where: { id },
      data: { reservedKg: 500, soldKg: 300, lastConfirmedAt: old, freshnessRemindedAt: old },
    });

    expect(fields(await s.api.patch(`/listings/${id}`, { form: 'CHILLED' }).expect(400))).toEqual([
      'form:draftOnly',
    ]);
    const below = await s.api.patch(`/listings/${id}`, { volumeKg: '799' }).expect(409);
    expect(below.body.error).toMatchObject({
      code: 'INSUFFICIENT_VOLUME',
      details: { committedKg: '800.000' },
    });

    const soldOut = await s.api.patch(`/listings/${id}`, { volumeKg: '800' }).expect(200);
    expect(soldOut.body).toMatchObject({ status: 'SOLD_OUT', availableKg: '0.000' });
    expect(new Date(soldOut.body.lastConfirmedAt as string).getTime()).toBeGreaterThan(
      old.getTime(),
    );
    expect(
      (await prisma.listing.findUniqueOrThrow({ where: { id } })).freshnessRemindedAt,
    ).toBeNull();
    const back = await s.api.patch(`/listings/${id}`, { volumeKg: '1000' }).expect(200);
    expect(back.body).toMatchObject({ status: 'ACTIVE', availableKg: '200.000' });

    await s.api.patch(`/listings/${id}`, { mediaIds: [] }).expect(400);
    await s.api.post(`/listings/${id}/archive`).expect(409);
  });

  it('confirm: STAFF confirms as is, OWNER may change volume and price; brings back a freshness pause', async () => {
    const s = await seller();
    const staff = await actor(app, sms);
    await addMember(app, s.org.id, staff.userId, 'STAFF');
    const photo = await addListingMedia(app, s.org.id, s.owner.userId);
    const id = (await s.api.post('/listings', s.body({ mediaIds: [photo.id] })).expect(201)).body
      .id as string;
    await s.api.post(`/listings/${id}/publish`).expect(200);
    await prismaOf(app).listing.update({
      where: { id },
      data: { status: 'PAUSED', pauseReason: 'FRESHNESS' },
    });
    const staffApi = as(staff, s.org.id);

    await staffApi.post(`/listings/${id}/confirm`, { volumeKg: '1500' }).expect(403);
    await staffApi.post(`/listings/${id}/pause`).expect(403);
    await staffApi.post('/listings', s.body()).expect(403);
    const confirmed = await staffApi.post(`/listings/${id}/confirm`).expect(200);
    expect(confirmed.body).toMatchObject({
      status: 'ACTIVE',
      pauseReason: null,
      volumeKg: '2000.000',
    });
    expect((await staffApi.get('/seller/listings').expect(200)).body.items).toHaveLength(1);

    const changed = await s.api
      .post(`/listings/${id}/confirm`, { volumeKg: '1500', pricePerKg: '25000' })
      .expect(200);
    expect(changed.body).toMatchObject({
      status: 'ACTIVE',
      volumeKg: '1500.000',
      pricePerKg: '25000',
    });
    expect(
      await prismaOf(app).domainEvent.count({
        where: { aggregateId: id, type: 'listing.confirmed' },
      }),
    ).toBe(2);

    await s.api.post(`/listings/${id}/pause`).expect(200);
    await s.api.post(`/listings/${id}/confirm`).expect(409); // ручная пауза снимается «Возобновить»
  });

  it('requires a verified seller to publish and isolates organizations', async () => {
    const s = await seller('UNVERIFIED');
    const photo = await addListingMedia(app, s.org.id, s.owner.userId);
    const id = (await s.api.post('/listings', s.body({ mediaIds: [photo.id] })).expect(201)).body
      .id as string;
    const refused = await s.api.post(`/listings/${id}/publish`).expect(403);
    expect(refused.body.error.code).toBe('ORG_NOT_VERIFIED');

    const outsider = await actor(app, sms);
    const outsiderOrg = await createOrg(app, outsider.userId);
    const buyer = await actor(app, sms);
    const buyerOrg = await createOrg(app, buyer.userId, { type: 'BUYER' });
    await expectIsolated(as(outsider, s.org.id).get(`/seller/listings/${id}`));
    await as(outsider, outsiderOrg.id).get(`/seller/listings/${id}`).expect(404);
    await as(outsider, outsiderOrg.id).patch(`/listings/${id}`, { description: 'x' }).expect(404);
    await as(outsider, outsiderOrg.id).post(`/listings/${id}/archive`).expect(404);
    expect(
      (await as(outsider, outsiderOrg.id).get('/seller/listings').expect(200)).body.items,
    ).toEqual([]);
    await as(buyer, buyerOrg.id).get('/seller/listings').expect(403);
    // чужие файлы не привязываются
    const foreign = await addListingMedia(app, outsiderOrg.id, outsider.userId);
    await s.api.patch(`/listings/${id}`, { mediaIds: [foreign.id] }).expect(400);

    const operator = await actor(app, sms, 'OPERATOR');
    await as(operator, s.org.id).get(`/seller/listings/${id}`).expect(200);
    await prismaOf(app).organization.update({
      where: { id: s.org.id },
      data: { verificationStatus: 'SUSPENDED' },
    });
    await s.api.post('/listings', s.body()).expect(403);
  });
});
