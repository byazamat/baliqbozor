import { describe, expect, it } from 'vitest';

import { isStoredUzPhone, normalizeUzPhone } from './phone.js';

describe('normalizeUzPhone', () => {
  it.each([
    ['+998901234567', '+998901234567'],
    ['+998 90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['+998 (90) 123-45-67', '+998901234567'],
    ['(90) 123 45 67', '+998901234567'],
    ['901234567', '+998901234567'],
    ['  +998901234567  ', '+998901234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUzPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '+7 900 123 45 67',
    '+99890123456',
    '+9989012345678',
    '90123456',
    '+901234567',
    '998-90-123-45-67x',
    'abc',
    '8 90 123 45 67',
  ])('rejects %j', (input) => {
    expect(normalizeUzPhone(input)).toBeNull();
  });
});

describe('isStoredUzPhone', () => {
  it('accepts only the canonical form', () => {
    expect(isStoredUzPhone('+998901234567')).toBe(true);
    expect(isStoredUzPhone('998901234567')).toBe(false);
    expect(isStoredUzPhone('+998 90 123 45 67')).toBe(false);
  });
});
