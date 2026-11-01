import { describe, expect, it } from 'vitest';

import { classifyRefresh, refreshExpiry } from './session.js';

const now = new Date('2026-11-01T00:00:00Z');
const active = { revokedAt: null, expiresAt: new Date('2026-12-01T00:00:00Z'), userActive: true };

describe('classifyRefresh', () => {
  it('rotates an active, unexpired session of an active user', () => {
    expect(classifyRefresh(active, now)).toBe('ROTATE');
  });

  it('detects reuse of a revoked token (even if also expired)', () => {
    expect(classifyRefresh({ ...active, revokedAt: now }, now)).toBe('REUSE_DETECTED');
    expect(classifyRefresh({ ...active, revokedAt: now, expiresAt: now }, now)).toBe(
      'REUSE_DETECTED',
    );
  });

  it('rejects unknown, expired tokens and blocked users', () => {
    expect(classifyRefresh(null, now)).toBe('INVALID');
    expect(classifyRefresh({ ...active, expiresAt: now }, now)).toBe('INVALID');
    expect(classifyRefresh({ ...active, userActive: false }, now)).toBe('INVALID');
  });
});

describe('refreshExpiry', () => {
  it('adds ttl days', () => {
    expect(refreshExpiry(now, 30).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });
});
