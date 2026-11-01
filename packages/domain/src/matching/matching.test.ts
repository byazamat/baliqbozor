import { describe, expect, it } from 'vitest';

import {
  allowedSizeClassIds,
  bestPerOrg,
  type ListingForMatching,
  matchListing,
  rankCandidates,
  type RequestForMatching,
  scoreParts,
  suggestSplit,
} from './matching.js';

const TASHKENT = { lat: 41.2995, lng: 69.2401 };
const SAMARKAND = { lat: 39.6542, lng: 66.9597 }; // ~270 км
const JIZZAKH = { lat: 40.1158, lng: 67.8422 }; // ~180 км
const NOW = new Date('2026-11-02T06:00:00Z');
const weights = { distance: 0.35, price: 0.25, reliability: 0.2, freshness: 0.1, volume: 0.1 };

const request: RequestForMatching = {
  speciesId: 2,
  sizeClassIds: [7],
  form: 'LIVE',
  volumeKg: '2500',
  minAcceptableKg: null,
  volumeRemaining: '2500',
  deliveryDateFrom: '2026-11-04',
  deliveryDateTo: '2026-11-06',
  targetPricePerKg: 26_000n,
  radiusKm: 350,
  point: TASHKENT,
};
const listing = (over: Partial<ListingForMatching> = {}): ListingForMatching => ({
  listingId: 'l1',
  orgId: 's1',
  farmId: 'f1',
  speciesId: 2,
  sizeClassId: 7,
  form: 'LIVE',
  availableKg: '2000',
  minOrderKg: '100',
  availableFrom: '2026-11-01',
  availableTo: '2026-11-30',
  pricePerKg: 26_000n,
  lastConfirmedAt: NOW,
  reliability: null,
  point: SAMARKAND,
  ...over,
});
const miss = (over: Partial<ListingForMatching>, r: Partial<RequestForMatching> = {}) => {
  const m = matchListing({ ...request, ...r }, listing(over));
  return m.ok ? 'OK' : m.miss;
};

describe('matching filter (SPEC 8.5)', () => {
  it('checks every condition', () => {
    expect(miss({})).toBe('OK');
    expect(miss({ speciesId: 3 })).toBe('SPECIES');
    expect(miss({ sizeClassId: 8 })).toBe('SIZE');
    expect(miss({ sizeClassId: 8 }, { sizeClassIds: [7, 8] })).toBe('OK');
    expect(miss({ form: 'CHILLED' })).toBe('FORM');
    expect(miss({ availableKg: '499' })).toBe('VOLUME'); // < 20% от 2500
    expect(miss({ availableKg: '500' })).toBe('OK');
    expect(miss({ availableKg: '600', minOrderKg: '700' })).toBe('VOLUME');
    expect(miss({}, { radiusKm: 200 })).toBe('DISTANCE');
    expect(miss({ availableFrom: '2026-11-07' })).toBe('WINDOW');
    // 270 км → 1 день в пути: вылов до 03.11 ещё успевает к 04.11
    expect(miss({ availableTo: '2026-11-03' })).toBe('OK');
    expect(miss({ availableTo: '2026-11-02' })).toBe('WINDOW');
    expect(miss({ availableTo: null })).toBe('OK');
  });

  it('allows adjacent size classes by sort order', () => {
    const sizes = [{ id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }];
    expect(allowedSizeClassIds(sizes, 7, false)).toEqual([7]);
    expect(allowedSizeClassIds(sizes, 7, true)).toEqual([6, 7, 8]);
    expect(allowedSizeClassIds(sizes, 5, true)).toEqual([5, 6]);
    expect(allowedSizeClassIds(sizes, 99, true)).toEqual([99]);
  });
});

describe('scoring', () => {
  const ctx = { now: NOW, freshnessDays: 7 };
  it('scores price, freshness, reliability and volume', () => {
    const p = scoreParts(request, listing(), 270, ctx);
    expect(p.price).toBe(1);
    expect(p.freshness).toBe(1);
    expect(p.reliability).toBe(0.6);
    expect(p.volume).toBe(0.8);
    expect(p.distance).toBeCloseTo(1 - 270 / 350);
    expect(scoreParts(request, listing({ pricePerKg: 39_000n }), 0, ctx).price).toBe(0);
    expect(scoreParts(request, listing({ pricePerKg: 32_500n }), 0, ctx).price).toBe(0.5);
    expect(scoreParts(request, listing({ pricePerKg: 28_600n }), 0, ctx).price).toBeCloseTo(0.8);
    expect(scoreParts(request, listing({ pricePerKg: null }), 0, ctx).price).toBe(0.5);
    expect(scoreParts({ ...request, targetPricePerKg: null }, listing(), 0, ctx).price).toBe(0.5);
    const old = new Date(NOW.getTime() - 4.5 * 86_400_000);
    expect(scoreParts(request, listing({ lastConfirmedAt: old }), 0, ctx).freshness).toBeCloseTo(
      0.5,
    );
    expect(scoreParts(request, listing({ lastConfirmedAt: null }), 0, ctx).freshness).toBe(0);
    expect(scoreParts(request, listing({ reliability: 90 }), 0, ctx).reliability).toBe(0.9);
    expect(scoreParts({ ...request, volumeRemaining: '0' }, listing(), 0, ctx).volume).toBe(1);
  });

  it('ranks candidates, keeps the best per seller and suggests a split (scenario 1)', () => {
    const s1 = listing({ listingId: 'a', orgId: 's1', farmId: 'f1' });
    const s1b = listing({ listingId: 'a2', orgId: 's1', farmId: 'f1b', pricePerKg: 30_000n });
    const s2 = listing({
      listingId: 'b',
      orgId: 's2',
      farmId: 'f2',
      point: JIZZAKH,
      availableKg: '1000',
      pricePerKg: 25_000n,
    });
    const far = listing({
      listingId: 'c',
      orgId: 's3',
      farmId: 'f3',
      point: { lat: 42.46, lng: 59.6 },
    });
    const ranked = rankCandidates(request, [s1, s1b, s2, far], { ...ctx, weights });
    expect(ranked.map((c) => c.listingId)).toEqual(['b', 'a', 'a2']); // Джизак ближе и дешевле
    expect(bestPerOrg(ranked).map((c) => c.orgId)).toEqual(['s2', 's1']);

    const split = suggestSplit('2500', ranked, 4);
    expect(split).toEqual({
      lines: [
        { listingId: 'b', orgId: 's2', farmId: 'f2', volumeKg: '1000.000' },
        { listingId: 'a', orgId: 's1', farmId: 'f1', volumeKg: '1500.000' },
      ],
      coveredKg: '2500.000',
      complete: true,
    });
    expect(suggestSplit('5000', ranked, 2)).toMatchObject({
      coveredKg: '3000.000',
      complete: false,
    });
    expect(suggestSplit('100', ranked, 0)).toEqual({
      lines: [],
      coveredKg: '0.000',
      complete: false,
    });
  });
});
