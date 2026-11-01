import { describe, expect, it } from 'vitest';

import { type DomainError } from '../errors.js';
import {
  assertValidListingTerms,
  availableKg,
  type ListingTerms,
  type ListingTermsContext,
} from './rules.js';

const ctx: ListingTermsContext = {
  today: '2026-11-02',
  minOrderKg: 100,
  nowMaxDaysAhead: 7,
  checkKind: true,
};
const terms: ListingTerms = {
  kind: 'AVAILABLE_NOW',
  volumeKg: '2000',
  minOrderKg: '100',
  priceType: 'FIXED',
  pricePerKg: 26_000n,
  availableFrom: '2026-11-03',
  availableTo: '2026-11-30',
};

const issues = (t: Partial<ListingTerms>, c: Partial<ListingTermsContext> = {}) => {
  try {
    assertValidListingTerms({ ...terms, ...t }, { ...ctx, ...c });
    return [];
  } catch (err) {
    const e = err as DomainError;
    if (e.code !== 'VALIDATION_FAILED') return [e.code];
    const d = e.details as { fields: { field: string; constraints: string[] }[] };
    return d.fields.map((f) => `${f.field}:${f.constraints.join(',')}`);
  }
};

describe('assertValidListingTerms', () => {
  it('accepts valid terms', () => {
    expect(issues({})).toEqual([]);
    expect(issues({ priceType: 'NEGOTIABLE', pricePerKg: null, availableTo: null })).toEqual([]);
    expect(
      issues({ kind: 'FUTURE_HARVEST', availableFrom: '2026-11-10', availableTo: null }),
    ).toEqual([]);
    expect(issues({ availableFrom: '2026-10-01' })).toEqual([]);
  });

  it('checks volumes against the platform minimum', () => {
    expect(issues({ volumeKg: '0' })).toEqual(['volumeKg:positive']);
    expect(issues({ minOrderKg: '99.999' })).toEqual(['minOrderKg:min']);
    expect(issues({ volumeKg: '150', minOrderKg: '200' })).toEqual(['volumeKg:gteMinOrder']);
    expect(issues({ minOrderKg: '200' }, { minOrderKg: 300 })).toEqual(['minOrderKg:min']);
  });

  it('checks price by price type', () => {
    expect(issues({ pricePerKg: null })).toEqual(['pricePerKg:positive']);
    expect(issues({ pricePerKg: 0n })).toEqual(['pricePerKg:positive']);
    expect(issues({ priceType: 'NEGOTIABLE' })).toEqual(['pricePerKg:mustBeEmpty']);
  });

  it('checks dates and the kind window', () => {
    expect(issues({ availableFrom: '2026-13-01' })).toEqual(['availableFrom:isDate']);
    expect(issues({ availableTo: 'tomorrow' })).toEqual(['availableTo:isDate']);
    expect(issues({ availableTo: '2026-11-02' })).toEqual(['availableTo:afterFrom']);
    expect(issues({ availableFrom: '2026-11-10', availableTo: null })).toEqual([
      'availableFrom:nowWindow',
    ]);
    expect(issues({ availableFrom: '2026-11-09', availableTo: null })).toEqual([]);
    expect(issues({ kind: 'FUTURE_HARVEST', availableFrom: '2026-11-09' })).toEqual([
      'availableFrom:futureWindow',
    ]);
    expect(
      issues({ availableFrom: '2026-12-25', availableTo: null }, { checkKind: false }),
    ).toEqual([]);
  });

  it('refuses to cut volume below reserved and sold', () => {
    expect(issues({ volumeKg: '1000' }, { committedKg: '1000' })).toEqual([]);
    expect(issues({ volumeKg: '999' }, { committedKg: '1000' })).toEqual(['INSUFFICIENT_VOLUME']);
  });
});

describe('availableKg', () => {
  it('subtracts reserved and sold', () => {
    expect(availableKg({ volumeKg: '2000', reservedKg: '1500.5', soldKg: '100' }).toFixed(3)).toBe(
      '399.500',
    );
  });
});
