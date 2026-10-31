import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors.js';
import { moneyToString, parseMoney } from './money.js';

describe('money', () => {
  it('round-trips integer sums', () => {
    expect(moneyToString(28000n)).toBe('28000');
    expect(parseMoney('37960000')).toBe(37960000n);
    expect(parseMoney('-500000')).toBe(-500000n);
  });

  it('rejects fractions and garbage', () => {
    expect(() => parseMoney('1.5')).toThrow(DomainError);
    expect(() => parseMoney('abc')).toThrow(DomainError);
    expect(() => parseMoney('')).toThrow(DomainError);
  });
});
