import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, addFarm, addListingMedia, addSpecies, createOrg } from './fixtures.js';

const TASHKENT = '41.2995,69.2401';

describe('public catalog (e2e)', () => {
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
  const search = (query: Record<string, string | number>) =>
    http().get('/api/v1/listings').query(query);

  /** Три продавца: Самарканд (~270 км от Ташкента), Джизак (~180 км), Ташкентская обл. (~30 км). */
  async function world() {
    const prisma = prismaOf(app);
    const carp = await addSpecies(app, 'SILVER_CARP');
    const trout = await addSpecies(app, 'TROUT');
    async function listing(opts: {
      region: string;
      lat: string;
      lng: string;
      status?: 'VERIFIED' | 'PENDING';
      listing?: Partial<{
        speciesId: number;
        sizeClassId: number;
        form: 'LIVE' | 'CHILLED';
        kind: 'AVAILABLE_NOW' | 'FUTURE_HARVEST';
        priceType: 'FIXED' | 'NEGOTIABLE';
        pricePerKg: bigint | null;
        status: 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'SOLD_OUT';
        availableFrom: Date;
        availableTo: Date | null;
        lastConfirmedAt: Date;
        volumeKg: number;
        reservedKg: number;
      }>;
    }) {
      const owner = await actor(app, sms);
      const org = await createOrg(app, owner.userId, {
        status: opts.status ?? 'VERIFIED',
        name: `Seller ${opts.region}`,
      });
      const farm = await addFarm(app, org.id, {
        name: `Secret farm ${opts.region}`,
        lat: opts.lat,
        lng: opts.lng,
        regionCode: opts.region,
      });
      const l = await prisma.listing.create({
        data: {
          sellerOrgId: org.id,
          farmId: farm.id,
          speciesId: carp.species.id,
          sizeClassId: carp.size.id,
          form: 'LIVE',
          kind: 'AVAILABLE_NOW',
          volumeKg: 2000,
          minOrderKg: 100,
          priceType: 'FIXED',
          pricePerKg: 26000n,
          availableFrom: new Date('2026-11-01'),
          availableTo: new Date('2026-12-31'),
          status: 'ACTIVE',
          lastConfirmedAt: new Date(),
          publishedAt: new Date(),
          createdById: owner.userId,
          ...opts.listing,
        },
      });
      await addListingMedia(app, org.id, owner.userId, { listingId: l.id });
      return { org, farm, listing: l };
    }
    const samarkand = await listing({ region: 'SAMARKAND', lat: '39.654200', lng: '66.959700' });
    const jizzakh = await listing({
      region: 'JIZZAKH',
      lat: '40.115800',
      lng: '67.842200',
      listing: { pricePerKg: 25000n, lastConfirmedAt: new Date(Date.now() - 86_400_000) },
    });
    const tashkent = await listing({
      region: 'TASHKENT_REGION',
      lat: '41.550000',
      lng: '69.500000',
      listing: {
        speciesId: trout.species.id,
        sizeClassId: trout.size.id,
        form: 'CHILLED',
        priceType: 'NEGOTIABLE',
        pricePerKg: null,
        kind: 'FUTURE_HARVEST',
        availableFrom: new Date('2027-03-01'),
        availableTo: null,
        lastConfirmedAt: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    // не видны: пауза, черновик, непроверенный продавец, весь объём в резерве
    await listing({ region: 'SAMARKAND', lat: '39.6', lng: '66.9', listing: { status: 'PAUSED' } });
    await listing({ region: 'SAMARKAND', lat: '39.6', lng: '66.9', listing: { status: 'DRAFT' } });
    await listing({ region: 'SAMARKAND', lat: '39.6', lng: '66.9', status: 'PENDING' });
    await listing({
      region: 'SAMARKAND',
      lat: '39.6',
      lng: '66.9',
      listing: { volumeKg: 1000, reservedKg: 1000 },
    });
    return { carp, trout, samarkand, jizzakh, tashkent };
  }

  const ids = (res: request.Response) => (res.body.items as { id: string }[]).map((i) => i.id);

  it('lists only active listings of verified sellers with available volume, without private data', async () => {
    const w = await world();
    const res = await search({}).expect(200);
    expect(ids(res)).toEqual([w.samarkand.listing.id, w.jizzakh.listing.id, w.tashkent.listing.id]);
    const item = res.body.items[0] as Record<string, unknown>;
    expect(item).toMatchObject({
      status: 'ACTIVE',
      availableKg: '2000.000',
      pricePerKg: '26000',
      region: { code: 'SAMARKAND' },
      seller: { ratingCount: 0 },
      distanceKm: null,
      mediaCount: 1,
      priceIndex: null,
    });
    expect((item.media as { url: string; thumbUrl: string }[])[0]?.url).toMatch(/^http/);
    const text = JSON.stringify(res.body);
    for (const secret of [
      'Secret farm',
      'Seller ',
      '39.654200',
      '66.959700',
      'farmId',
      'sellerOrgId',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('filters by species, form, kind, region, date and price', async () => {
    const w = await world();
    expect(ids(await search({ speciesId: w.trout.species.id }))).toEqual([w.tashkent.listing.id]);
    expect(ids(await search({ form: 'CHILLED' }))).toEqual([w.tashkent.listing.id]);
    expect(ids(await search({ kind: 'AVAILABLE_NOW', sizeClassId: w.carp.size.id }))).toEqual([
      w.samarkand.listing.id,
      w.jizzakh.listing.id,
    ]);
    expect(ids(await search({ regionId: w.jizzakh.farm.regionId }))).toEqual([
      w.jizzakh.listing.id,
    ]);
    expect(ids(await search({ availableOn: '2027-03-05' }))).toEqual([w.tashkent.listing.id]);
    expect(ids(await search({ maxPrice: '25500' }))).toEqual([w.jizzakh.listing.id]);
    await search({ maxPrice: '25.5' }).expect(400);
  });

  it('searches near a point within a radius and sorts by distance or price', async () => {
    const w = await world();
    const near = await search({ near: TASHKENT, radiusKm: 300, sort: 'distance' }).expect(200);
    expect(ids(near)).toEqual([
      w.tashkent.listing.id,
      w.jizzakh.listing.id,
      w.samarkand.listing.id,
    ]);
    const km = (near.body.items as { distanceKm: number }[]).map((i) => i.distanceKm);
    expect(km.every((d) => d % 5 === 0)).toBe(true);
    expect(km[0]).toBeLessThan(60);
    expect(km[2]).toBeGreaterThan(250);

    expect(ids(await search({ near: TASHKENT, radiusKm: 200 }))).toEqual([
      w.tashkent.listing.id,
      w.jizzakh.listing.id,
    ]);
    // без radiusKm — request.defaultRadiusKm (150 км)
    expect(ids(await search({ near: TASHKENT }))).toEqual([w.tashkent.listing.id]);
    expect(ids(await search({ sort: 'price' }))).toEqual([
      w.jizzakh.listing.id,
      w.samarkand.listing.id,
      w.tashkent.listing.id,
    ]);
    await search({ sort: 'distance' }).expect(400);
    await search({ near: '95,10' }).expect(400);
  });

  it('pages with an opaque cursor', async () => {
    await world();
    const first = await search({ limit: 2 }).expect(200);
    expect(first.body.items).toHaveLength(2);
    const second = await search({ limit: 2, cursor: first.body.nextCursor as string }).expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    await search({ cursor: 'garbage' }).expect(400);
  });

  it('shows a public card with all media and hides inactive ones', async () => {
    const w = await world();
    const prisma = prismaOf(app);
    const video = await addListingMedia(app, w.samarkand.org.id, w.samarkand.listing.createdById, {
      kind: 'VIDEO',
      listingId: w.samarkand.listing.id,
    });
    const card = await http()
      .get(`/api/v1/listings/${w.samarkand.listing.id}`)
      .query({ near: TASHKENT })
      .expect(200);
    expect(card.body).toMatchObject({ id: w.samarkand.listing.id, hasVideo: true, mediaCount: 2 });
    expect((card.body.media as { id: string }[]).map((m) => m.id)).toContain(video.id);
    expect(card.body.distanceKm).toBeGreaterThan(250);
    expect(JSON.stringify(card.body)).not.toContain('Secret farm');

    await prisma.listing.update({
      where: { id: w.samarkand.listing.id },
      data: { status: 'PAUSED' },
    });
    await http().get(`/api/v1/listings/${w.samarkand.listing.id}`).expect(404);
    await http().get('/api/v1/listings/00000000-0000-4000-8000-000000000000').expect(404);
  });
});
