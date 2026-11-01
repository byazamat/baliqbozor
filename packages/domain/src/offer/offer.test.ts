import { describe, expect, it } from 'vitest';

import type { DomainError } from '../errors.js';
import {
  assertValidOffer,
  nextOfferStatus,
  type OfferContext,
  offerValidUntil,
  type OfferTerms,
} from './rules.js';

const terms: OfferTerms = { volumeKg: '1800', pricePerKg: 26_000n, availableDate: '2026-11-03' };
const ctx: OfferContext = {
  today: '2026-11-02',
  deliveryDateTo: '2026-11-06',
  volumeRemaining: '2500',
  minOrderKg: 100,
  listing: { availableKg: '2000', minOrderKg: '200' },
};
const issues = (t: Partial<OfferTerms>, c: Partial<OfferContext> = {}) => {
  try {
    assertValidOffer({ ...terms, ...t }, { ...ctx, ...c });
    return [];
  } catch (err) {
    const d = (err as DomainError).details as {
      fields: { field: string; constraints: string[] }[];
    };
    return d.fields.map((f) => `${f.field}:${f.constraints.join(',')}`);
  }
};

describe('offer rules', () => {
  it('accepts a valid offer with and without a listing', () => {
    expect(issues({})).toEqual([]);
    expect(issues({ volumeKg: '150' }, { listing: null })).toEqual([]);
  });

  it('checks volume against the listing, the request and the platform minimum', () => {
    expect(issues({ volumeKg: '150' })).toEqual(['volumeKg:min']);
    expect(issues({ volumeKg: '50' }, { listing: null })).toEqual(['volumeKg:min']);
    expect(issues({ volumeKg: '2100' })).toEqual(['volumeKg:lteAvailable']);
    expect(issues({ volumeKg: '1900' }, { volumeRemaining: '1000' })).toEqual([
      'volumeKg:lteRemaining',
    ]);
  });

  it('checks price and date', () => {
    expect(issues({ pricePerKg: 0n })).toEqual(['pricePerKg:positive']);
    expect(issues({ availableDate: '2026-11-01' })).toEqual(['availableDate:notPast']);
    expect(issues({ availableDate: '2026-11-07' })).toEqual(['availableDate:beforeDeliveryEnd']);
    expect(issues({ availableDate: 'soon' })).toEqual(['availableDate:isDate']);
  });

  it('is valid for 24 h but not after the request expires', () => {
    const now = new Date('2026-11-02T06:00:00Z');
    expect(offerValidUntil(now, 24, new Date('2026-11-05T00:00:00Z')).toISOString()).toBe(
      '2026-11-03T06:00:00.000Z',
    );
    expect(offerValidUntil(now, 24, new Date('2026-11-02T19:00:00Z')).toISOString()).toBe(
      '2026-11-02T19:00:00.000Z',
    );
  });

  it('changes only pending offers', () => {
    expect(nextOfferStatus('PENDING', 'UPDATE')).toBe('PENDING');
    expect(nextOfferStatus('PENDING', 'WITHDRAW')).toBe('WITHDRAWN');
    expect(nextOfferStatus('PENDING', 'EXPIRE')).toBe('EXPIRED');
    expect(() => nextOfferStatus('ACCEPTED', 'WITHDRAW')).toThrow(/Cannot WITHDRAW/);
  });
});
