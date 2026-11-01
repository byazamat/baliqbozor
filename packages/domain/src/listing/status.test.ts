import { describe, expect, it } from 'vitest';

import type { ListingPauseReason, ListingStatus } from '../enums.js';
import { type DomainError } from '../errors.js';
import {
  assertPublishable,
  isListingEditable,
  type ListingAction,
  nextListingState,
  type PublishContext,
  statusAfterVolumeChange,
} from './status.js';

const STATUSES: ListingStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'SOLD_OUT', 'EXPIRED', 'ARCHIVED'];
const ACTIONS: ListingAction[] = [
  'PUBLISH',
  'RESUME',
  'PAUSE',
  'CONFIRM',
  'ARCHIVE',
  'AUTOPAUSE',
  'EXPIRE',
  'FARM_DEACTIVATED',
];

const run = (
  status: ListingStatus,
  action: ListingAction,
  pauseReason: ListingPauseReason | null = null,
  reservedKg = '0',
) => {
  try {
    const s = nextListingState({ status, pauseReason }, action, { reservedKg });
    return s.pauseReason ? `${s.status}/${s.pauseReason}` : s.status;
  } catch (err) {
    const e = err as DomainError;
    return (e.details as { reason?: string }).reason ?? e.code;
  }
};

describe('nextListingState', () => {
  it('matches the full transition table', () => {
    const table = Object.fromEntries(
      STATUSES.map((s) => [
        s,
        ACTIONS.map((a) => run(s, a, s === 'PAUSED' ? 'MANUAL' : null)).join(' '),
      ]),
    );
    const X = 'INVALID_TRANSITION';
    expect(table).toEqual({
      DRAFT: `ACTIVE ${X} ${X} ${X} ARCHIVED ${X} ${X} ${X}`,
      ACTIVE: `${X} ${X} PAUSED/MANUAL ACTIVE ARCHIVED PAUSED/FRESHNESS EXPIRED PAUSED/FARM_INACTIVE`,
      PAUSED: `ACTIVE ACTIVE ${X} ${X} ARCHIVED ${X} EXPIRED ${X}`,
      SOLD_OUT: `${X} ${X} ${X} SOLD_OUT ARCHIVED ${X} EXPIRED ${X}`,
      EXPIRED: `ACTIVE ${X} ${X} ${X} ARCHIVED ${X} ${X} ${X}`,
      ARCHIVED: `${X} ${X} ${X} ${X} ${X} ${X} ${X} ${X}`,
    });
  });

  it('confirm brings back a freshness pause only', () => {
    expect(run('PAUSED', 'CONFIRM', 'FRESHNESS')).toBe('ACTIVE');
    expect(run('PAUSED', 'CONFIRM', 'FARM_INACTIVE')).toBe('INVALID_TRANSITION');
  });

  it('does not archive with reservations', () => {
    expect(run('ACTIVE', 'ARCHIVE', null, '10')).toBe('HAS_RESERVATIONS');
  });
});

describe('assertPublishable', () => {
  const ok: PublishContext = {
    org: { type: 'SELLER', verificationStatus: 'VERIFIED' },
    farmActive: true,
    processedPhotos: 1,
    availableKg: '100',
    availableTo: '2026-11-02',
    today: '2026-11-02',
  };
  const check = (c: Partial<PublishContext>) => {
    try {
      assertPublishable({ ...ok, ...c });
      return [];
    } catch (err) {
      const e = err as DomainError;
      const d = e.details as { fields?: { field: string; constraints: string[] }[] } | undefined;
      return d?.fields ? d.fields.map((f) => `${f.field}:${f.constraints.join(',')}`) : [e.code];
    }
  };

  it('passes a ready listing', () => {
    expect(check({})).toEqual([]);
    expect(check({ availableTo: null })).toEqual([]);
  });

  it('requires a verified seller', () => {
    expect(check({ org: { type: 'SELLER', verificationStatus: 'PENDING' } })).toEqual([
      'ORG_NOT_VERIFIED',
    ]);
    expect(check({ org: { type: 'SELLER', verificationStatus: 'SUSPENDED' } })).toEqual([
      'ORG_SUSPENDED',
    ]);
  });

  it('lists every missing condition', () => {
    expect(
      check({ farmActive: false, processedPhotos: 0, availableKg: '0', availableTo: '2026-11-01' }),
    ).toEqual([
      'farmId:farmActive',
      'mediaIds:photoRequired',
      'volumeKg:availableVolume',
      'availableTo:notPast',
    ]);
  });
});

describe('statusAfterVolumeChange', () => {
  it('moves between ACTIVE and SOLD_OUT', () => {
    expect(statusAfterVolumeChange('ACTIVE', '0')).toBe('SOLD_OUT');
    expect(statusAfterVolumeChange('ACTIVE', '1')).toBe('ACTIVE');
    expect(statusAfterVolumeChange('SOLD_OUT', '5')).toBe('ACTIVE');
    expect(statusAfterVolumeChange('SOLD_OUT', '0')).toBe('SOLD_OUT');
    expect(statusAfterVolumeChange('PAUSED', '0')).toBe('PAUSED');
  });

  it('allows edits except in archive', () => {
    expect(STATUSES.filter(isListingEditable)).toEqual(STATUSES.slice(0, 5));
  });
});
