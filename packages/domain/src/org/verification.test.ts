import { describe, expect, it } from 'vitest';

import { type OrgType, VerificationStatus, type VerificationStatus as VS } from '../enums.js';
import { DomainError } from '../errors.js';
import {
  assertOrgFieldsEditable,
  nextVerificationStatus,
  type VerificationAction,
} from './verification.js';

const ctx = (orgType: OrgType = 'SELLER', wasVerified = false) => ({ orgType, wasVerified });
const ALL = Object.values(VerificationStatus);

function expectInvalid(fn: () => unknown) {
  try {
    fn();
    expect.unreachable();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe('INVALID_TRANSITION');
  }
}

describe('nextVerificationStatus', () => {
  const allowed: [VS, VerificationAction, OrgType, boolean, VS][] = [
    ['UNVERIFIED', 'SUBMIT', 'SELLER', false, 'PENDING'],
    ['REJECTED', 'SUBMIT', 'CARRIER', false, 'PENDING'],
    ['PENDING', 'APPROVE', 'SELLER', false, 'VERIFIED'],
    ['UNVERIFIED', 'APPROVE', 'BUYER', false, 'VERIFIED'],
    ['REJECTED', 'APPROVE', 'BUYER', false, 'VERIFIED'],
    ['PENDING', 'REJECT', 'SELLER', false, 'REJECTED'],
    ['VERIFIED', 'SUSPEND', 'SELLER', true, 'SUSPENDED'],
    ['PENDING', 'SUSPEND', 'SELLER', false, 'SUSPENDED'],
    ['SUSPENDED', 'UNSUSPEND', 'SELLER', true, 'VERIFIED'],
    ['SUSPENDED', 'UNSUSPEND', 'SELLER', false, 'UNVERIFIED'],
  ];

  it.each(allowed)('%s --%s(%s)--> %s', (from, action, type, was, to) => {
    expect(nextVerificationStatus(from, action, ctx(type, was))).toBe(to);
  });

  /** Эталон SPEC 8.1 + D-29/D-39 в виде предиката: разрешён ли переход вообще. */
  const isAllowedBySpec = (from: VS, action: VerificationAction, type: OrgType): boolean => {
    switch (action) {
      case 'SUBMIT':
        return from === 'UNVERIFIED' || from === 'REJECTED';
      case 'APPROVE':
        return (
          from === 'PENDING' || (type === 'BUYER' && (from === 'UNVERIFIED' || from === 'REJECTED'))
        );
      case 'REJECT':
        return from === 'PENDING';
      case 'SUSPEND':
        return from !== 'SUSPENDED';
      case 'UNSUSPEND':
        return from === 'SUSPENDED';
    }
  };

  it('matches the spec for every status, action and organization type', () => {
    const actions: VerificationAction[] = ['SUBMIT', 'APPROVE', 'REJECT', 'SUSPEND', 'UNSUSPEND'];
    let checked = 0;
    for (const type of ['SELLER', 'BUYER', 'CARRIER'] as const) {
      for (const from of ALL) {
        for (const action of actions) {
          checked += 1;
          if (isAllowedBySpec(from, action, type)) {
            expect(() => nextVerificationStatus(from, action, ctx(type))).not.toThrow();
          } else {
            expectInvalid(() => nextVerificationStatus(from, action, ctx(type)));
          }
        }
      }
    }
    expect(checked).toBe(75);
  });

  it('does not let a seller or carrier skip review', () => {
    expectInvalid(() => nextVerificationStatus('UNVERIFIED', 'APPROVE', ctx('SELLER')));
    expectInvalid(() => nextVerificationStatus('REJECTED', 'APPROVE', ctx('CARRIER')));
  });

  it('reports from and action in details', () => {
    try {
      nextVerificationStatus('PENDING', 'SUBMIT', ctx());
    } catch (err) {
      expect((err as DomainError).details).toEqual({ from: 'PENDING', action: 'SUBMIT' });
    }
  });
});

describe('assertOrgFieldsEditable', () => {
  const code = (fn: () => void) => {
    try {
      fn();
      return null;
    } catch (err) {
      return (err as DomainError).code;
    }
  };

  it('never allows changing the organization type', () => {
    expect(code(() => assertOrgFieldsEditable('UNVERIFIED', ['type'], 'OWNER'))).toBe(
      'VALIDATION_FAILED',
    );
    expect(code(() => assertOrgFieldsEditable('VERIFIED', ['type'], 'PLATFORM'))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('lets the owner edit legal fields only before review', () => {
    for (const s of ['UNVERIFIED', 'REJECTED'] as const) {
      expect(code(() => assertOrgFieldsEditable(s, ['name', 'tin'], 'OWNER'))).toBeNull();
    }
    for (const s of ['PENDING', 'VERIFIED'] as const) {
      expect(code(() => assertOrgFieldsEditable(s, ['legalForm'], 'OWNER'))).toBe('CONFLICT');
      expect(code(() => assertOrgFieldsEditable(s, ['description'], 'OWNER'))).toBeNull();
    }
  });

  it('blocks the owner of a suspended organization and lets the platform edit', () => {
    expect(code(() => assertOrgFieldsEditable('SUSPENDED', ['description'], 'OWNER'))).toBe(
      'ORG_SUSPENDED',
    );
    expect(code(() => assertOrgFieldsEditable('VERIFIED', ['name', 'tin'], 'PLATFORM'))).toBeNull();
  });
});
