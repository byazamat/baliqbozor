import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatKg,
  formatMoney,
  formatPhone,
  formatPricePerKg,
  formatTime,
} from './format.js';

/** Тесты сравнивают с форматами SPEC 12.1, где неразрывный пробел записан обычным. */
const plain = (s: string): string => s.replaceAll(' ', ' ');

describe('formatMoney', () => {
  it('formats sums per SPEC 12.1', () => {
    expect(plain(formatMoney(1250000n, 'uz'))).toBe("1 250 000 so'm");
    expect(plain(formatMoney('1250000', 'ru'))).toBe('1 250 000 сум');
    expect(plain(formatMoney(0n, 'ru'))).toBe('0 сум');
    expect(plain(formatMoney(999n, 'uz'))).toBe("999 so'm");
    expect(plain(formatMoney(-500000n, 'ru'))).toBe('-500 000 сум');
    expect(plain(formatMoney(37960000n, 'uz'))).toBe("37 960 000 so'm");
  });

  it('uses non-breaking spaces', () => {
    expect(formatMoney(1000n, 'uz')).toBe("1 000 so'm");
  });

  it('formats price per kg', () => {
    expect(plain(formatPricePerKg('28000', 'uz'))).toBe("28 000 so'm/kg");
    expect(plain(formatPricePerKg(28000n, 'ru'))).toBe('28 000 сум/кг');
  });
});

describe('formatKg', () => {
  it('formats weight per SPEC 12.1', () => {
    expect(plain(formatKg('1250.500', 'uz'))).toBe('1 250,5 kg');
    expect(plain(formatKg('1250.500', 'ru'))).toBe('1 250,5 кг');
    expect(plain(formatKg('1500.000', 'uz'))).toBe('1 500 kg');
    expect(plain(formatKg(20, 'ru'))).toBe('20 кг');
  });

  it('rounds half up to one decimal', () => {
    expect(plain(formatKg('0.25', 'uz'))).toBe('0,3 kg');
    expect(plain(formatKg('0.249', 'uz'))).toBe('0,2 kg');
    expect(plain(formatKg('999.96', 'uz'))).toBe('1 000 kg');
    expect(plain(formatKg({ toString: () => '-12.35' }, 'uz'))).toBe('-12,4 kg');
    expect(plain(formatKg('-0.01', 'uz'))).toBe('0 kg');
  });
});

describe('dates', () => {
  it('keeps date-only strings as Tashkent dates', () => {
    expect(formatDate('2026-11-05')).toBe('05.11.2026');
  });

  it('converts instants to Asia/Tashkent (UTC+5)', () => {
    expect(formatDate(new Date('2026-11-04T19:30:00Z'))).toBe('05.11.2026');
    expect(formatDate('2026-11-04T18:59:00Z')).toBe('04.11.2026');
    expect(formatTime('2026-11-05T09:05:00Z')).toBe('14:05');
    expect(formatTime(new Date('2026-11-05T19:00:00Z'))).toBe('00:00');
    expect(formatDateTime('2026-11-05T09:05:00Z')).toBe('05.11.2026 14:05');
    expect(formatDateTime(new Date('2026-12-31T20:00:00Z'))).toBe('01.01.2027 01:00');
  });
});

describe('formatPhone', () => {
  it('applies the Uzbek mask', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone('998 90 123-45-67')).toBe('+998 90 123 45 67');
  });

  it('leaves other numbers unchanged', () => {
    expect(formatPhone('+77011234567')).toBe('+77011234567');
    expect(formatPhone('12345')).toBe('12345');
  });
});
