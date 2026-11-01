import { describe, expect, it } from 'vitest';

import {
  addDays,
  dateOnly,
  isIsoDate,
  isWithinWorkingHours,
  tashkentDate,
  tashkentMinuteOfDay,
} from './tashkent.js';

describe('tashkent calendar', () => {
  it('shifts the date at 19:00 UTC', () => {
    expect(tashkentDate(new Date('2026-11-02T18:59:00Z'))).toBe('2026-11-02');
    expect(tashkentDate(new Date('2026-11-02T19:00:00Z'))).toBe('2026-11-03');
  });

  it('computes the minute of day', () => {
    expect(tashkentMinuteOfDay(new Date('2026-11-02T03:30:00Z'))).toBe(8 * 60 + 30);
  });

  it('validates and shifts ISO dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dateOnly(new Date('2026-11-05T00:00:00Z'))).toBe('2026-11-05');
  });

  it('checks working hours in Tashkent time', () => {
    const hours = { from: '08:00', to: '20:00' };
    expect(isWithinWorkingHours(new Date('2026-11-02T02:59:00Z'), hours)).toBe(false);
    expect(isWithinWorkingHours(new Date('2026-11-02T03:00:00Z'), hours)).toBe(true);
    expect(isWithinWorkingHours(new Date('2026-11-02T14:59:00Z'), hours)).toBe(true);
    expect(isWithinWorkingHours(new Date('2026-11-02T15:00:00Z'), hours)).toBe(false);
  });
});
