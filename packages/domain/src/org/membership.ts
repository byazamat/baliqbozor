import type { MemberRole } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';

export interface MemberRef {
  userId: string;
  role: MemberRole;
}

const ownersCount = (members: readonly MemberRef[]) =>
  members.filter((m) => m.role === 'OWNER').length;

function findMember(members: readonly MemberRef[], userId: string): MemberRef {
  const member = members.find((m) => m.userId === userId);
  if (!member) throw new DomainError(ErrorCode.NOT_FOUND, 'Member not found');
  return member;
}

/** Нельзя понизить последнего OWNER (SPEC 10.3). */
export function assertCanChangeRole(
  members: readonly MemberRef[],
  userId: string,
  newRole: MemberRole,
): void {
  const member = findMember(members, userId);
  if (member.role === 'OWNER' && newRole !== 'OWNER' && ownersCount(members) === 1) {
    throw new DomainError(ErrorCode.CONFLICT, 'Organization must keep at least one owner', {
      reason: 'LAST_OWNER',
    });
  }
}

/** Нельзя исключить последнего OWNER (SPEC 10.3). */
export function assertCanRemoveMember(members: readonly MemberRef[], userId: string): void {
  const member = findMember(members, userId);
  if (member.role === 'OWNER' && ownersCount(members) === 1) {
    throw new DomainError(ErrorCode.CONFLICT, 'Organization must keep at least one owner', {
      reason: 'LAST_OWNER',
    });
  }
}

export interface InvitationRef {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export function isInvitationActive(inv: InvitationRef, now: Date): boolean {
  return !inv.acceptedAt && !inv.revokedAt && inv.expiresAt > now;
}

export function invitationExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
