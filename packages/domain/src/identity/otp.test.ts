import { describe, expect, it } from 'vitest';

import { DomainError } from '../errors.js';
import {
  assertOtpRequestAllowed,
  checkOtp,
  decideOtpRequest,
  generateOtpCode,
  type OtpPolicy,
  type OtpRequestState,
} from './otp.js';

const policy: OtpPolicy = {
  ttlSeconds: 300,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  maxPerPhonePerHour: 5,
  maxPerIpPerHour: 20,
  blockMinutes: 60,
};
const now = new Date('2026-11-01T10:00:00Z');
const at = (sec: number) => new Date(now.getTime() + sec * 1000);
const base: OtpRequestState = {
  now,
  lastSentAt: null,
  sentToPhoneLastHour: 0,
  sentFromIpLastHour: 0,
  blockedUntil: null,
};

describe('generateOtpCode', () => {
  it('builds 6 digits from the random source', () => {
    const digits = [1, 0, 9, 3, 7, 5];
    expect(generateOtpCode(() => digits.shift() ?? 0)).toBe('109375');
  });
});

describe('decideOtpRequest', () => {
  it('allows the first request with expiry and resend delay', () => {
    expect(decideOtpRequest(base, policy)).toEqual({
      allowed: true,
      expiresAt: at(300),
      resendAfterSec: 60,
    });
  });

  it('enforces resend cooldown and allows after it', () => {
    expect(decideOtpRequest({ ...base, lastSentAt: at(-30) }, policy)).toEqual({
      allowed: false,
      reason: 'COOLDOWN',
      retryAfterSec: 30,
    });
    expect(decideOtpRequest({ ...base, lastSentAt: at(-60) }, policy).allowed).toBe(true);
  });

  it('blocks the phone for an hour when the hourly limit is exceeded', () => {
    expect(decideOtpRequest({ ...base, sentToPhoneLastHour: 4 }, policy).allowed).toBe(true);
    expect(decideOtpRequest({ ...base, sentToPhoneLastHour: 5 }, policy)).toEqual({
      allowed: false,
      reason: 'PHONE_LIMIT',
      retryAfterSec: 3600,
      blockUntil: at(3600),
    });
  });

  it('keeps a blocked phone blocked until blockedUntil', () => {
    expect(decideOtpRequest({ ...base, blockedUntil: at(120) }, policy)).toEqual({
      allowed: false,
      reason: 'BLOCKED',
      retryAfterSec: 120,
    });
    expect(decideOtpRequest({ ...base, blockedUntil: now }, policy).allowed).toBe(true);
  });

  it('limits requests per IP', () => {
    expect(decideOtpRequest({ ...base, sentFromIpLastHour: 19 }, policy).allowed).toBe(true);
    expect(decideOtpRequest({ ...base, sentFromIpLastHour: 20 }, policy)).toMatchObject({
      allowed: false,
      reason: 'IP_LIMIT',
    });
  });
});

describe('assertOtpRequestAllowed', () => {
  it('passes allowed and throws RATE_LIMITED with retryAfterSec', () => {
    expect(() => assertOtpRequestAllowed(decideOtpRequest(base, policy))).not.toThrow();
    try {
      assertOtpRequestAllowed(decideOtpRequest({ ...base, lastSentAt: at(-10) }, policy));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('RATE_LIMITED');
      expect((err as DomainError).details).toEqual({ reason: 'COOLDOWN', retryAfterSec: 50 });
    }
  });
});

describe('checkOtp', () => {
  const otp = { expiresAt: at(100), attempts: 0, consumedAt: null };

  it('accepts a valid code', () => {
    expect(checkOtp(otp, true, now, policy)).toEqual({ ok: true });
  });

  it('counts wrong attempts and switches to TOO_MANY on the last one', () => {
    expect(checkOtp(otp, false, now, policy)).toEqual({
      ok: false,
      code: 'OTP_INVALID',
      countAttempt: true,
    });
    expect(checkOtp({ ...otp, attempts: 4 }, false, now, policy)).toEqual({
      ok: false,
      code: 'OTP_TOO_MANY_ATTEMPTS',
      countAttempt: true,
    });
  });

  it('rejects even a correct code after attempts are exhausted', () => {
    expect(checkOtp({ ...otp, attempts: 5 }, true, now, policy)).toEqual({
      ok: false,
      code: 'OTP_TOO_MANY_ATTEMPTS',
      countAttempt: false,
    });
  });

  it.each([
    ['missing', null],
    ['expired', { ...otp, expiresAt: now }],
    ['consumed', { ...otp, consumedAt: at(-1) }],
  ])('%s code → OTP_EXPIRED', (_name, stored) => {
    expect(checkOtp(stored, true, now, policy)).toEqual({
      ok: false,
      code: 'OTP_EXPIRED',
      countAttempt: false,
    });
  });
});
