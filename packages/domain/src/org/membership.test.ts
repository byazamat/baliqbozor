import { describe, expect, it } from 'vitest';

import { type DomainError } from '../errors.js';
import {
  assertCanChangeRole,
  assertCanRemoveMember,
  invitationExpiry,
  isInvitationActive,
  type MemberRef,
} from './membership.js';

const code = (fn: () => void) => {
  try {
    fn();
    return null;
  } catch (err) {
    return (err as DomainError).code;
  }
};

const single: MemberRef[] = [
  { userId: 'o', role: 'OWNER' },
  { userId: 'm', role: 'MANAGER' },
];
const twoOwners: MemberRef[] = [...single, { userId: 'o2', role: 'OWNER' }];

describe('membership rules', () => {
  it('keeps at least one owner', () => {
    expect(code(() => assertCanChangeRole(single, 'o', 'MANAGER'))).toBe('CONFLICT');
    expect(code(() => assertCanRemoveMember(single, 'o'))).toBe('CONFLICT');
    expect(code(() => assertCanChangeRole(twoOwners, 'o', 'STAFF'))).toBeNull();
    expect(code(() => assertCanRemoveMember(twoOwners, 'o'))).toBeNull();
  });

  it('allows ordinary changes and keeping the owner role', () => {
    expect(code(() => assertCanChangeRole(single, 'm', 'STAFF'))).toBeNull();
    expect(code(() => assertCanChangeRole(single, 'm', 'OWNER'))).toBeNull();
    expect(code(() => assertCanChangeRole(single, 'o', 'OWNER'))).toBeNull();
    expect(code(() => assertCanRemoveMember(single, 'm'))).toBeNull();
  });

  it('reports unknown members as NOT_FOUND', () => {
    expect(code(() => assertCanChangeRole(single, 'x', 'STAFF'))).toBe('NOT_FOUND');
    expect(code(() => assertCanRemoveMember(single, 'x'))).toBe('NOT_FOUND');
  });
});

describe('invitations', () => {
  const now = new Date('2026-11-01T00:00:00Z');
  const expiresAt = invitationExpiry(now, 30);

  it('expires after ttl days', () => {
    expect(expiresAt.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('is active only while not accepted, revoked or expired', () => {
    const inv = { expiresAt, acceptedAt: null, revokedAt: null };
    expect(isInvitationActive(inv, now)).toBe(true);
    expect(isInvitationActive(inv, expiresAt)).toBe(false);
    expect(isInvitationActive({ ...inv, acceptedAt: now }, now)).toBe(false);
    expect(isInvitationActive({ ...inv, revokedAt: now }, now)).toBe(false);
  });
});
