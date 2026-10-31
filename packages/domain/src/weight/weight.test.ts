import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors.js';
import { Decimal, parseWeight, weightToString } from './weight.js';

describe('weight', () => {
  it('formats with three decimals', () => {
    expect(weightToString(new Decimal('1250.5'))).toBe('1250.500');
    expect(weightToString('1500')).toBe('1500.000');
    expect(weightToString(20)).toBe('20.000');
    expect(weightToString({ toString: () => '0.125' })).toBe('0.125');
  });

  it('parses API strings', () => {
    expect(parseWeight('1480.000').equals(new Decimal(1480))).toBe(true);
    expect(() => parseWeight('1.2345')).toThrow(DomainError);
    expect(() => parseWeight('-5')).toThrow(DomainError);
  });
});
