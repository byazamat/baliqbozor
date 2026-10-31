import { describe, expect, it } from 'vitest';

import { maskPhone, maskPhonesInText } from './pii.js';

describe('maskPhone', () => {
  it('matches the SPEC example', () => {
    expect(maskPhone('+998901234567')).toBe('+99890*****67');
    expect(maskPhone('998901234567')).toBe('99890*****67');
  });

  it('masks short local numbers', () => {
    expect(maskPhone('901234567')).toBe('90*****67');
    expect(maskPhone('1234')).toBe('****');
  });
});

describe('maskPhonesInText', () => {
  it('masks phones inside text', () => {
    expect(maskPhonesInText('otp sent to +998 90 123 45 67 ok')).toBe(
      'otp sent to +99890*****67 ok',
    );
    expect(maskPhonesInText('order FO-2026-000123')).toBe('order FO-2026-000123');
    expect(maskPhonesInText('{"phone":"998901234567"}')).toBe('{"phone":"99890*****67"}');
  });
});
