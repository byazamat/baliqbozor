import { describe, expect, it } from 'vitest';

import type { RequestStatus } from '../enums.js';
import type { DomainError } from '../errors.js';
import {
  assertValidRequestTerms,
  isRequestOpen,
  minAcceptable,
  nextRequestStatus,
  type RequestAction,
  requestExpiresAt,
  type RequestTerms,
  volumeRemaining,
} from './index.js';

const terms: RequestTerms = {
  volumeKg: '2500',
  minAcceptableKg: null,
  deliveryDateFrom: '2026-11-04',
  deliveryDateTo: '2026-11-06',
  targetPricePerKg: 26_000n,
  radiusKm: 350,
};
const issues = (t: Partial<RequestTerms>) => {
  try {
    assertValidRequestTerms({ ...terms, ...t }, { today: '2026-11-02', minOrderKg: 100 });
    return [];
  } catch (err) {
    const d = (err as DomainError).details as {
      fields: { field: string; constraints: string[] }[];
    };
    return d.fields.map((f) => `${f.field}:${f.constraints.join(',')}`);
  }
};

describe('request terms', () => {
  it('accepts valid terms', () => {
    expect(issues({})).toEqual([]);
    expect(issues({ minAcceptableKg: '1000', targetPricePerKg: null })).toEqual([]);
  });

  it('reports every broken field', () => {
    expect(issues({ volumeKg: '50' })).toEqual(['volumeKg:min']);
    expect(issues({ minAcceptableKg: '3000' })).toEqual(['minAcceptableKg:lteVolume']);
    expect(issues({ minAcceptableKg: '10' })).toEqual(['minAcceptableKg:min']);
    expect(issues({ deliveryDateFrom: '2026-11-01' })).toEqual(['deliveryDateFrom:notPast']);
    expect(issues({ deliveryDateTo: '2026-11-03' })).toEqual(['deliveryDateTo:afterFrom']);
    expect(issues({ deliveryDateFrom: 'x', deliveryDateTo: 'y' })).toEqual([
      'deliveryDateFrom:isDate',
      'deliveryDateTo:isDate',
    ]);
    expect(issues({ targetPricePerKg: 0n, radiusKm: 0 })).toEqual([
      'targetPricePerKg:positive',
      'radiusKm:range',
    ]);
  });

  it('expires at the delivery start or after the default days, whichever is first', () => {
    const submitted = new Date('2026-11-02T06:00:00Z');
    expect(requestExpiresAt(submitted, '2026-11-04', 5).toISOString()).toBe(
      '2026-11-03T19:00:00.000Z',
    );
    expect(requestExpiresAt(submitted, '2026-11-20', 5).toISOString()).toBe(
      '2026-11-07T06:00:00.000Z',
    );
  });

  it('computes the remaining volume and the minimum acceptable volume', () => {
    expect(volumeRemaining('2500', ['1500', '500']).toFixed(3)).toBe('500.000');
    expect(volumeRemaining('1000', ['1500']).toFixed(3)).toBe('0.000');
    expect(minAcceptable('2500', null).toFixed(0)).toBe('2500');
    expect(minAcceptable('2500', '1000').toFixed(0)).toBe('1000');
  });
});

describe('request status machine', () => {
  const STATUSES: RequestStatus[] = [
    'DRAFT',
    'PENDING_REVIEW',
    'OPEN',
    'OFFERS_RECEIVED',
    'ORDERED',
    'CANCELLED',
    'EXPIRED',
  ];
  const ACTIONS: RequestAction[] = [
    'SUBMIT',
    'APPROVE',
    'REJECT',
    'FIRST_OFFER',
    'CANCEL',
    'EXPIRE',
  ];
  const run = (s: RequestStatus, a: RequestAction) => {
    try {
      return nextRequestStatus(s, a);
    } catch {
      return '-';
    }
  };

  it('matches the transition table', () => {
    expect(
      Object.fromEntries(STATUSES.map((s) => [s, ACTIONS.map((a) => run(s, a)).join(' ')])),
    ).toEqual({
      DRAFT: 'OPEN - - - CANCELLED -',
      PENDING_REVIEW: '- OPEN CANCELLED - CANCELLED -',
      OPEN: '- - - OFFERS_RECEIVED CANCELLED EXPIRED',
      OFFERS_RECEIVED: '- - - - CANCELLED EXPIRED',
      ORDERED: '- - - - - -',
      CANCELLED: '- - - - - -',
      EXPIRED: '- - - - - -',
    });
  });

  it('sends the first request to review', () => {
    expect(nextRequestStatus('DRAFT', 'SUBMIT', { needsReview: true })).toBe('PENDING_REVIEW');
    expect(STATUSES.filter(isRequestOpen)).toEqual(['OPEN', 'OFFERS_RECEIVED']);
  });
});
