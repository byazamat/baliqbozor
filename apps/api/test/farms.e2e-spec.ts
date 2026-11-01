import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addFarm, addMember, createOrg, expectIsolated } from './fixtures.js';

describe('farms (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();
  let regionId: number;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: SMS_PROVIDER, value: sms }] });
  });
  beforeEach(async () => {
    await resetState(app);
    regionId = (
      await prismaOf(app).region.create({
        data: { code: 'SAMARKAND', nameUz: 'Samarqand viloyati', nameRu: 'Самаркандская область' },
      })
    ).id;
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const body = (over: object = {}) => ({
    name: 'Zarafshon hovuzlari',
    regionId,
    districtName: 'Urgut',
    lat: '39.654200',
    lng: '66.959700',
    waterBodyTypes: ['POND', 'CAGE'],
    areaHa: '12.5',
    ...over,
  });
  const as = (who: { accessToken: string }, orgId: string) => ({
    get: (path: string) => http().get(path).set(bearer(who)).set('X-Org-Id', orgId),
    post: (path: string, data: object) =>
      http().post(path).set(bearer(who)).set('X-Org-Id', orgId).send(data),
    patch: (path: string, data: object) =>
      http().patch(path).set(bearer(who)).set('X-Org-Id', orgId).send(data),
  });

  it('creates, lists, reads and edits a farm with photos; audit and events', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    const prisma = prismaOf(app);
    const photo = await prisma.mediaFile.create({
      data: {
        uploaderId: owner.userId,
        orgId: org.id,
        purpose: 'FARM_PHOTO',
        kind: 'IMAGE',
        status: 'PROCESSED',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        storageKey: `farm_photo/${org.id}/a`,
        thumbnailKey: `farm_photo/${org.id}/a.thumb.webp`,
      },
    });

    const created = await as(owner, org.id)
      .post('/api/v1/farms', body({ mediaIds: [photo.id] }))
      .expect(201);
    expect(created.body).toMatchObject({
      name: 'Zarafshon hovuzlari',
      region: { code: 'SAMARKAND' },
      lat: '39.654200',
      lng: '66.959700',
      waterBodyTypes: ['POND', 'CAGE'],
      areaHa: '12.50',
      isActive: true,
      activeListings: 0,
      photos: [{ id: photo.id, status: 'PROCESSED', hasThumbnail: true }],
    });
    const id = created.body.id as string;

    const list = await as(owner, org.id).get('/api/v1/farms').expect(200);
    expect((list.body as { id: string }[]).map((f) => f.id)).toEqual([id]);

    const edited = await as(owner, org.id)
      .patch(`/api/v1/farms/${id}`, { name: 'Zarafshon-2', mediaIds: [], description: 'Karp' })
      .expect(200);
    expect(edited.body).toMatchObject({ name: 'Zarafshon-2', description: 'Karp', photos: [] });
    expect(await prisma.mediaFile.findUniqueOrThrow({ where: { id: photo.id } })).toMatchObject({
      farmId: null,
    });
    expect(
      (
        await prisma.domainEvent.findMany({
          where: { aggregateId: id },
          orderBy: { createdAt: 'asc' },
        })
      ).map((e) => e.type),
    ).toEqual(['farm.created', 'farm.updated']);
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(2);
  });

  it('validates required fields, the service area, region and media', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId);
    const other = await createOrg(app, owner.userId, { name: 'Other' });
    const api = as(owner, org.id);
    const fieldsOf = async (data: object) =>
      (
        (await api.post('/api/v1/farms', data).expect(400)).body.error.details.fields as {
          field: string;
        }[]
      ).map((f) => f.field);

    expect(await fieldsOf(body({ waterBodyTypes: [] }))).toContain('waterBodyTypes');
    expect(await fieldsOf(body({ lat: '69.240100', lng: '41.299500' }))).toEqual(['lat']);
    expect(await fieldsOf(body({ name: 'A' }))).toEqual(['name']);
    expect(await fieldsOf(body({ regionId: 999 }))).toEqual(['regionId']);
    const foreign = await prismaOf(app).mediaFile.create({
      data: {
        uploaderId: owner.userId,
        orgId: other.id,
        purpose: 'FARM_PHOTO',
        kind: 'IMAGE',
        status: 'PROCESSED',
        mimeType: 'image/jpeg',
        sizeBytes: 1,
        storageKey: 'farm_photo/x/1',
      },
    });
    expect(await fieldsOf(body({ mediaIds: [foreign.id] }))).toEqual(['mediaIds']);
  });

  it('deactivation pauses active listings of the farm', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId, { status: 'VERIFIED' });
    const farm = await addFarm(app, org.id);
    const prisma = prismaOf(app);
    const species = await prisma.fishSpecies.create({
      data: { code: 'CARP', nameUz: 'Karp', nameRu: 'Карп' },
    });
    const size = await prisma.sizeClass.create({
      data: {
        speciesId: species.id,
        code: 'C_1_2',
        labelUz: '1–2 kg',
        labelRu: '1–2 кг',
        minKg: 1,
        maxKg: 2,
      },
    });
    const listing = (status: 'ACTIVE' | 'DRAFT') =>
      prisma.listing.create({
        data: {
          sellerOrgId: org.id,
          farmId: farm.id,
          speciesId: species.id,
          sizeClassId: size.id,
          form: 'LIVE',
          volumeKg: 1000,
          minOrderKg: 100,
          priceType: 'FIXED',
          pricePerKg: 26000n,
          availableFrom: new Date('2026-11-01'),
          status,
          createdById: owner.userId,
        },
      });
    const active = await listing('ACTIVE');
    const draft = await listing('DRAFT');

    const res = await as(owner, org.id)
      .patch(`/api/v1/farms/${farm.id}`, { isActive: false })
      .expect(200);
    expect(res.body).toMatchObject({ isActive: false, activeListings: 0 });
    expect(await prisma.listing.findUniqueOrThrow({ where: { id: active.id } })).toMatchObject({
      status: 'PAUSED',
      pauseReason: 'FARM_INACTIVE',
    });
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe(
      'DRAFT',
    );
    const deactivated = await prisma.domainEvent.findFirstOrThrow({
      where: { type: 'farm.deactivated', aggregateId: farm.id },
    });
    expect(deactivated.payload).toMatchObject({ pausedListingIds: [active.id] });
    expect(
      await prisma.domainEvent.count({
        where: { type: 'listing.status_changed', aggregateId: active.id },
      }),
    ).toBe(1);
  });

  it('STAFF views only; buyers, carriers and outsiders are refused; operators act by X-Org-Id', async () => {
    const owner = await actor(app, sms);
    const staff = await actor(app, sms);
    const manager = await actor(app, sms);
    const buyer = await actor(app, sms);
    const outsider = await actor(app, sms);
    const operator = await actor(app, sms, 'OPERATOR');
    const org = await createOrg(app, owner.userId);
    const buyerOrg = await createOrg(app, buyer.userId, { type: 'BUYER' });
    const outsiderOrg = await createOrg(app, outsider.userId);
    await addMember(app, org.id, staff.userId, 'STAFF');
    await addMember(app, org.id, manager.userId, 'MANAGER');
    const farm = await addFarm(app, org.id);

    await as(staff, org.id).get('/api/v1/farms').expect(200);
    await as(staff, org.id).get(`/api/v1/farms/${farm.id}`).expect(200);
    await as(staff, org.id).post('/api/v1/farms', body()).expect(403);
    await as(staff, org.id).patch(`/api/v1/farms/${farm.id}`, { name: 'X1' }).expect(403);
    await as(manager, org.id)
      .patch(`/api/v1/farms/${farm.id}`, { name: 'Manager edit' })
      .expect(200);
    await as(buyer, buyerOrg.id).get('/api/v1/farms').expect(403);
    await expectIsolated(as(outsider, org.id).get(`/api/v1/farms/${farm.id}`));
    await as(outsider, outsiderOrg.id).get(`/api/v1/farms/${farm.id}`).expect(404);
    expect((await as(outsider, outsiderOrg.id).get('/api/v1/farms').expect(200)).body).toEqual([]);

    await as(operator, org.id).get(`/api/v1/farms/${farm.id}`).expect(200);
    await as(operator, org.id)
      .patch(`/api/v1/farms/${farm.id}`, { name: 'By operator' })
      .expect(200);
  });

  it('a suspended seller cannot create farms; D-28 needs an active farm to submit verification', async () => {
    const owner = await actor(app, sms);
    const suspended = await createOrg(app, owner.userId, { status: 'SUSPENDED' });
    await as(owner, suspended.id).post('/api/v1/farms', body()).expect(403);

    const org = await createOrg(app, owner.userId, { name: 'New seller' });
    const doc = await prismaOf(app).mediaFile.create({
      data: {
        uploaderId: owner.userId,
        orgId: org.id,
        purpose: 'ORG_VERIFICATION',
        kind: 'PDF',
        status: 'UPLOADED',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        storageKey: `org_verification/${org.id}/1`,
      },
    });
    const submit = () =>
      http()
        .post(`/api/v1/orgs/${org.id}/verification`)
        .set(bearer(owner))
        .send({ mediaIds: [doc.id] });
    const refused = await submit().expect(400);
    expect(refused.body.error.details.fields).toEqual([
      { field: 'farms', constraints: ['farmRequired'] },
    ]);
    const farm = await addFarm(app, org.id);
    await prismaOf(app).farm.update({ where: { id: farm.id }, data: { isActive: false } });
    await submit().expect(400);
    await prismaOf(app).farm.update({ where: { id: farm.id }, data: { isActive: true } });
    await submit().expect(200);
  });
});
