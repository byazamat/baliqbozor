import { describe, expect, it } from 'vitest';

import { maskPhone, maskPhonesDeep, maskPhonesInText } from './pii.js';

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

describe('maskPhonesDeep', () => {
  it('masks strings in nested plain objects and arrays', () => {
    expect(
      maskPhonesDeep({ a: '+998901234567', b: [{ c: 'call 998901234567' }], n: 1, z: null }),
    ).toEqual({ a: '+99890*****67', b: [{ c: 'call 99890*****67' }], n: 1, z: null });
    expect(maskPhonesDeep('998901234567')).toBe('99890*****67');
  });

  it('keeps class instances untouched (getters stay intact)', () => {
    class Res {
      get headersSent() {
        return true;
      }
    }
    const res = new Res();
    const err = new Error('+998901234567');
    const out = maskPhonesDeep({ res, err }) as { res: Res; err: Error };
    expect(out.res).toBe(res);
    expect(out.res.headersSent).toBe(true);
    expect(out.err).toBe(err);
  });

  it('handles null-prototype objects and stops at max depth', () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, {
      p: '998901234567',
    });
    expect(maskPhonesDeep(bare)).toEqual({ p: '99890*****67' });
    const deep = { a: { b: { c: { d: { e: { f: { g: '998901234567' } } } } } } };
    expect(JSON.stringify(maskPhonesDeep(deep))).toContain('998901234567');
  });
});
