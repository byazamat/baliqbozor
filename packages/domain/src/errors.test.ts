import { describe, expect, it } from 'vitest';

import { DomainError, ERROR_CODES, ERROR_HTTP_STATUS, ErrorCode, isErrorCode } from './errors.js';

describe('errors', () => {
  it('contains every code from SPEC 10.2', () => {
    const spec = [
      'VALIDATION_FAILED',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'INVALID_TRANSITION',
      'INSUFFICIENT_VOLUME',
      'ORG_NOT_VERIFIED',
      'ORG_SUSPENDED',
      'OTP_INVALID',
      'OTP_EXPIRED',
      'OTP_TOO_MANY_ATTEMPTS',
      'RATE_LIMITED',
      'COMMISSION_OVERDUE_BLOCK',
      'MEDIA_TOO_LARGE',
      'MEDIA_TYPE_NOT_ALLOWED',
    ];
    expect(ERROR_CODES).toEqual(expect.arrayContaining(spec));
  });

  it('maps every code to an HTTP status', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('DomainError carries code, details and status', () => {
    const err = new DomainError(ErrorCode.INSUFFICIENT_VOLUME, 'not enough', {
      availableKg: '350.000',
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('INSUFFICIENT_VOLUME');
    expect(err.message).toBe('not enough');
    expect(err.details).toEqual({ availableKg: '350.000' });
    expect(err.httpStatus).toBe(409);
    expect(new DomainError(ErrorCode.NOT_FOUND).message).toBe('NOT_FOUND');
  });

  it('isErrorCode guards strings', () => {
    expect(isErrorCode('FORBIDDEN')).toBe(true);
    expect(isErrorCode('NOPE')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});
