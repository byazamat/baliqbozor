import { tashkentDate } from '@baliqbozor/domain';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addMember, addSpecies, createOrg, expectIsolated } from './fixtures.js';

const DAY = 24 * 60 * 60 * 1000;
const date = (days: number) => tashkentDate(new Date(Date.now() + days * DAY));

describe('buyer requests and first-request review (e2e)', () => {
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
      patch: (p: string, d: object) => h(http().patch(`/api/v1${p}`)).send(d),
    };
  };

  async function buyer(status: 'VERIFIED' | 'UNVERIFIED' = 'UNVERIFIED') {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId, { type: 'BUYER', status });
    const prisma = prismaOf(app);
    const region = await prisma.region.upsert({
      where: { code: 'TASHKENT_CITY' },
      create: { code: 'TASHKENT_CITY', nameUz: 'Toshkent', nameRu: 'Ташкент' },
      update: {},
    });
    const address = await prisma.address.create({
      data: {
        orgId: org.id,
        label: 'Restoran',
        addressText: 'Chilonzor 1',
        regionId: region.id,
        lat: '41.285300',
        lng: '69.203400',
      },
    });
    const { species, size } = (await prisma.fishSpecies.findFirst())
      ? {
          species: await prisma.fishSpecies.findFirstOrThrow(),
          size: await prisma.sizeClass.findFirstOrThrow(),
        }
      : await addSpecies(app);
    const body = (over: object = {}) => ({
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
    });
    return { owner, org, address, body, api: as(owner, org.id) };
  }

  const fields = (res: request.Response) =>
    (res.body.error.details.fields as { field: string; constraints: string[] }[]).map(
      (f) => `${f.field}:${f.constraints.join(',')}`,
    );

  it('creates a draft, sends the first request to review, the operator approves; the next opens at once', async () => {
    const b = await buyer();
    const operator = await actor(app, sms, 'OPERATOR');
    const draft = await b.api.post('/requests', b.body()).expect(201);
    const year = date(0).slice(0, 4);
    expect(draft.body).toMatchObject({
      number: `RQ-${year}-000001`,
      status: 'DRAFT',
      volumeKg: '2500.000',
      volumeRemaining: '2500.000',
      minAcceptableKg: null,
      targetPricePerKg: '26000',
      deliveryAddress: { id: b.address.id, region: { code: 'TASHKENT_CITY' } },
      pendingOffers: 0,
    });
    const id = draft.body.id as string;
    await b.api.patch(`/requests/${id}`, { minAcceptableKg: '1000', notes: 'Tirik' }).expect(200);

    const submitted = await b.api.post(`/requests/${id}/submit`).expect(200);
    expect(submitted.body).toMatchObject({ status: 'PENDING_REVIEW', openedAt: null });
    expect(new Date(submitted.body.expiresAt as string).getTime()).toBeLessThanOrEqual(
      Date.now() + 2 * DAY,
    );
    await b.api.patch(`/requests/${id}`, { notes: 'x' }).expect(409);
    const prisma = prismaOf(app);
    const task = await prisma.opsTask.findFirstOrThrow({
      where: { requestId: id, type: 'REVIEW_REQUEST' },
    });
    expect(task.status).toBe('OPEN');

    const queue = await as(operator).get('/admin/requests').expect(200);
    expect((queue.body.items as { id: string }[]).map((r) => r.id)).toEqual([id]);
    await as(b.owner).get('/admin/requests').expect(403);
    const approved = await as(operator).post(`/admin/requests/${id}/approve`).expect(200);
    expect(approved.body).toMatchObject({ status: 'OPEN', buyerName: 'Test Org' });
    expect(approved.body.openedAt).not.toBeNull();
    expect((await prisma.opsTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe(
      'DONE',
    );
    await as(operator).post(`/admin/requests/${id}/approve`).expect(409);

    const second = await b.api.post('/requests', b.body()).expect(201);
    expect(second.body.number).toBe(`RQ-${year}-000002`);
    expect(
      (await b.api.post(`/requests/${second.body.id as string}/submit`).expect(200)).body.status,
    ).toBe('OPEN');

    const events = await prisma.domainEvent.findMany({
      where: { aggregateId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual([
      'request.created',
      'request.updated',
      'request.submitted',
      'request.approved',
      'request.opened',
    ]);
    expect((await b.api.get('/requests/my?status=OPEN').expect(200)).body.items).toHaveLength(2);
  });

  it('opens at once for a verified buyer; rejection needs a note and cancels', async () => {
    const verified = await buyer('VERIFIED');
    const r = await verified.api.post('/requests', verified.body()).expect(201);
    expect(
      (await verified.api.post(`/requests/${r.body.id as string}/submit`).expect(200)).body.status,
    ).toBe('OPEN');

    const b = await buyer();
    const operator = await actor(app, sms, 'OPERATOR');
    const id = (await b.api.post('/requests', b.body()).expect(201)).body.id as string;
    await b.api.post(`/requests/${id}/submit`).expect(200);
    expect(fields(await as(operator).post(`/admin/requests/${id}/reject`, {}).expect(400))).toEqual(
      ['note:required'],
    );
    const rejected = await as(operator)
      .post(`/admin/requests/${id}/reject`, { note: 'Не дозвонились' })
      .expect(200);
    expect(rejected.body).toMatchObject({ status: 'CANCELLED', reviewNote: 'Не дозвонились' });
    // следующая заявка снова на модерации: открытых ещё не было
    const next = (await b.api.post('/requests', b.body()).expect(201)).body.id as string;
    expect((await b.api.post(`/requests/${next}/submit`).expect(200)).body.status).toBe(
      'PENDING_REVIEW',
    );
    expect((await b.api.post(`/requests/${next}/cancel`).expect(200)).body.status).toBe(
      'CANCELLED',
    );
    await b.api.post(`/requests/${next}/cancel`).expect(409);
  });

  it('validates SPEC 8.4 terms, species and address', async () => {
    const b = await buyer();
    const bad = async (over: object) =>
      fields(await b.api.post('/requests', b.body(over)).expect(400));
    expect(await bad({ volumeKg: '50' })).toEqual(['volumeKg:min']);
    expect(await bad({ minAcceptableKg: '3000' })).toEqual(['minAcceptableKg:lteVolume']);
    expect(await bad({ deliveryDateFrom: date(-1) })).toEqual(['deliveryDateFrom:notPast']);
    expect(await bad({ deliveryDateTo: date(1) })).toEqual(['deliveryDateTo:afterFrom']);
    const other = await addSpecies(app, 'TROUT');
    expect(await bad({ sizeClassId: other.size.id })).toEqual(['sizeClassId:matchesSpecies']);
    const foreign = await buyer();
    expect(await bad({ deliveryAddressId: foreign.address.id })).toEqual([
      'deliveryAddressId:exists',
    ]);
    const noRadius = await b.api.post('/requests', b.body({ radiusKm: undefined })).expect(201);
    expect(noRadius.body.radiusKm).toBe(150);
  });

  it('only OWNER/MANAGER of a buyer manage requests; organizations are isolated', async () => {
    const b = await buyer();
    const staff = await actor(app, sms);
    await addMember(app, b.org.id, staff.userId, 'STAFF');
    const seller = await actor(app, sms);
    const sellerOrg = await createOrg(app, seller.userId);
    const id = (await b.api.post('/requests', b.body()).expect(201)).body.id as string;

    await as(staff, b.org.id).post('/requests', b.body()).expect(403);
    await as(staff, b.org.id).get(`/requests/${id}`).expect(200);
    await as(staff, b.org.id).post(`/requests/${id}/submit`).expect(403);
    await as(seller, sellerOrg.id).post('/requests', b.body()).expect(403);
    await expectIsolated(as(seller, b.org.id).get(`/requests/${id}`));

    const other = await buyer();
    await other.api.get(`/requests/${id}`).expect(404);
    await other.api.post(`/requests/${id}/cancel`).expect(404);
    expect((await other.api.get('/requests/my').expect(200)).body.items).toEqual([]);

    const operator = await actor(app, sms, 'OPERATOR');
    await as(operator, b.org.id).get(`/requests/${id}`).expect(200);
    await as(operator).get(`/admin/requests/${id}`).expect(200);
    await prismaOf(app).organization.update({
      where: { id: b.org.id },
      data: { verificationStatus: 'SUSPENDED' },
    });
    await b.api.post('/requests', b.body()).expect(403);
  });
});
