import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addMember, createOrg, expectIsolated } from './fixtures.js';

describe('addresses and dictionaries (e2e)', () => {
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
        data: { code: 'TASHKENT_CITY', nameUz: 'Toshkent shahri', nameRu: 'г. Ташкент', sort: 1 },
      })
    ).id;
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const body = (over: object = {}) => ({
    label: 'Ресторан на Чиланзаре',
    addressText: 'Чиланзар, 9 квартал',
    regionId,
    lat: '41.285300',
    lng: '69.203400',
    contactPhone: '901234567',
    ...over,
  });

  it('creates, lists, updates and archives buyer addresses with a single default', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId, { type: 'BUYER' });
    const base = `/api/v1/orgs/${org.id}/addresses`;

    const first = await http().post(base).set(bearer(owner)).send(body()).expect(201);
    expect(first.body).toMatchObject({
      isDefault: true,
      lat: '41.2853',
      contactPhone: '+998901234567',
      region: { code: 'TASHKENT_CITY' },
    });
    const second = await http()
      .post(base)
      .set(bearer(owner))
      .send(body({ label: 'Склад', isDefault: true }))
      .expect(201);
    expect(second.body.isDefault).toBe(true);

    let list = await http().get(base).set(bearer(owner)).expect(200);
    expect(
      (list.body as { label: string; isDefault: boolean }[]).map((a) => [a.label, a.isDefault]),
    ).toEqual([
      ['Склад', true],
      ['Ресторан на Чиланзаре', false],
    ]);

    const upd = await http()
      .patch(`/api/v1/addresses/${first.body.id as string}`)
      .set(bearer(owner))
      .set('X-Org-Id', org.id)
      .send({ workingHours: '08:00–11:00', isDefault: true })
      .expect(200);
    expect(upd.body).toMatchObject({ workingHours: '08:00–11:00', isDefault: true });

    await http()
      .delete(`/api/v1/addresses/${first.body.id as string}`)
      .set(bearer(owner))
      .set('X-Org-Id', org.id)
      .expect(204);
    list = await http().get(base).set(bearer(owner)).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ label: 'Склад', isDefault: true })]);
    expect(await prismaOf(app).address.count({ where: { isArchived: true } })).toBe(1);
  });

  it('validates coordinates, region and phone', async () => {
    const owner = await actor(app, sms);
    const org = await createOrg(app, owner.userId, { type: 'BUYER' });
    const post = (b: object) =>
      http().post(`/api/v1/orgs/${org.id}/addresses`).set(bearer(owner)).send(b);
    await post(body({ lat: '91.0' })).expect(400);
    await post(body({ lng: 'abc' })).expect(400);
    await post(body({ regionId: 999 })).expect(400);
    await post(body({ contactPhone: '12' })).expect(400);
    await post(body({ label: '' })).expect(400);
  });

  it('allows only buyers; STAFF reads, OWNER/MANAGER manage; isolates other organizations', async () => {
    const owner = await actor(app, sms);
    const staff = await actor(app, sms);
    const outsider = await actor(app, sms);
    const buyer = await createOrg(app, owner.userId, { type: 'BUYER' });
    const seller = await createOrg(app, owner.userId, { type: 'SELLER' });
    const otherBuyer = await createOrg(app, outsider.userId, { type: 'BUYER' });
    await addMember(app, buyer.id, staff.userId, 'STAFF');
    const created = await http()
      .post(`/api/v1/orgs/${buyer.id}/addresses`)
      .set(bearer(owner))
      .send(body())
      .expect(201);
    const id = created.body.id as string;

    await http().get(`/api/v1/orgs/${seller.id}/addresses`).set(bearer(owner)).expect(403);
    await http().get(`/api/v1/orgs/${buyer.id}/addresses`).set(bearer(staff)).expect(200);
    await http()
      .post(`/api/v1/orgs/${buyer.id}/addresses`)
      .set(bearer(staff))
      .send(body())
      .expect(403);

    await expectIsolated(http().get(`/api/v1/orgs/${buyer.id}/addresses`).set(bearer(outsider)));
    // Посторонний со своей организацией в заголовке не видит чужой адрес.
    await expectIsolated(
      http()
        .patch(`/api/v1/addresses/${id}`)
        .set(bearer(outsider))
        .set('X-Org-Id', otherBuyer.id)
        .send({ label: 'x' }),
    );
    await expectIsolated(
      http().delete(`/api/v1/addresses/${id}`).set(bearer(outsider)).set('X-Org-Id', otherBuyer.id),
    );
    await expectIsolated(
      http().delete(`/api/v1/addresses/${id}`).set(bearer(outsider)).set('X-Org-Id', buyer.id),
    );
  });

  it('serves public dictionaries in sort order with active size classes', async () => {
    const prisma = prismaOf(app);
    await prisma.region.create({
      data: { code: 'ANDIJAN', nameUz: 'Andijon', nameRu: 'Андижанская', sort: 2 },
    });
    const species = await prisma.fishSpecies.create({
      data: {
        code: 'SILVER_CARP',
        nameUz: 'Oq do‘ngpeshona',
        nameRu: 'Толстолобик белый',
        sort: 1,
      },
    });
    await prisma.fishSpecies.create({
      data: { code: 'OLD', nameUz: 'x', nameRu: 'x', isActive: false },
    });
    await prisma.sizeClass.createMany({
      data: [
        {
          speciesId: species.id,
          code: '2-3',
          minKg: 2,
          maxKg: 3,
          labelUz: '2–3 kg',
          labelRu: '2–3 кг',
          sort: 2,
        },
        {
          speciesId: species.id,
          code: '1-2',
          minKg: 1,
          maxKg: 2,
          labelUz: '1–2 kg',
          labelRu: '1–2 кг',
          sort: 1,
        },
        {
          speciesId: species.id,
          code: '3+',
          minKg: 3,
          labelUz: '3+ kg',
          labelRu: '3+ кг',
          sort: 3,
          isActive: false,
        },
      ],
    });

    const regions = await http().get('/api/v1/dict/regions').expect(200);
    expect((regions.body as { code: string }[]).map((r) => r.code)).toEqual([
      'TASHKENT_CITY',
      'ANDIJAN',
    ]);
    const sp = await http().get('/api/v1/dict/species').expect(200);
    expect(sp.body).toEqual([
      expect.objectContaining({
        code: 'SILVER_CARP',
        sizeClasses: [
          expect.objectContaining({ code: '1-2', minKg: '1.000', maxKg: '2.000' }),
          expect.objectContaining({ code: '2-3' }),
        ],
      }),
    ]);
  });
});
