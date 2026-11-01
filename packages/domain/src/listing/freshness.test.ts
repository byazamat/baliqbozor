import { describe, expect, it } from 'vitest';

import {
  freshnessCutoffs,
  freshnessDecision,
  freshnessDueAt,
  type FreshnessInput,
} from './freshness.js';

const settings = { freshnessDays: 7, workingHours: { from: '08:00', to: '20:00' } };
const confirmed = new Date('2026-11-02T05:00:00Z'); // 10:00 Ташкент
const at = (iso: string) => new Date(iso);
const base: FreshnessInput = {
  status: 'ACTIVE',
  lastConfirmedAt: confirmed,
  freshnessRemindedAt: null,
  availableTo: null,
};
const decide = (l: Partial<FreshnessInput>, now: string) =>
  freshnessDecision({ ...base, ...l }, at(now), settings);

describe('freshness', () => {
  it('computes the due date and the cutoffs', () => {
    expect(freshnessDueAt(confirmed, 7).toISOString()).toBe('2026-11-09T05:00:00.000Z');
    const c = freshnessCutoffs(at('2026-11-09T05:00:00Z'), 7);
    expect(c.pauseIfConfirmedBefore.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(c.remindIfConfirmedBefore.toISOString()).toBe('2026-11-03T05:00:00.000Z');
  });

  it('reminds once a day before the due date within working hours', () => {
    expect(decide({}, '2026-11-08T04:59:00Z')).toBeNull();
    expect(decide({}, '2026-11-08T05:00:00Z')).toBe('REMIND');
    expect(decide({}, '2026-11-08T16:00:00Z')).toBeNull(); // 21:00 Ташкент
    expect(
      decide({ freshnessRemindedAt: at('2026-11-08T05:00:00Z') }, '2026-11-08T06:00:00Z'),
    ).toBeNull();
    // напоминание прошлого цикла не считается
    expect(
      decide({ freshnessRemindedAt: at('2026-10-30T05:00:00Z') }, '2026-11-08T06:00:00Z'),
    ).toBe('REMIND');
  });

  it('auto-pauses when the due date passes', () => {
    expect(decide({}, '2026-11-09T05:00:00Z')).toBe('AUTOPAUSE');
    expect(
      decide({ freshnessRemindedAt: at('2026-11-08T05:00:00Z') }, '2026-11-09T22:00:00Z'),
    ).toBe('AUTOPAUSE');
  });

  it('expires by the Tashkent date before anything else', () => {
    expect(decide({ availableTo: '2026-11-08' }, '2026-11-08T14:59:00Z')).toBe('REMIND');
    expect(decide({ availableTo: '2026-11-08' }, '2026-11-08T19:00:00Z')).toBe('EXPIRE');
    expect(decide({ status: 'PAUSED', availableTo: '2026-11-01' }, '2026-11-03T00:00:00Z')).toBe(
      'EXPIRE',
    );
    expect(
      decide({ status: 'DRAFT', availableTo: '2026-11-01' }, '2026-11-03T00:00:00Z'),
    ).toBeNull();
  });

  it('ignores listings that are not active or never confirmed', () => {
    expect(decide({ status: 'PAUSED' }, '2026-12-01T05:00:00Z')).toBeNull();
    expect(decide({ lastConfirmedAt: null }, '2026-12-01T05:00:00Z')).toBeNull();
  });
});
