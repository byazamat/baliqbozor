import { describe, expect, it } from 'vitest';

import type { OrgType, VerificationStatus } from '../enums.js';
import { type DomainError } from '../errors.js';
import { assertOrgCan, type OrgGatedAction } from './status-gate.js';

function result(action: OrgGatedAction, type: OrgType, status: VerificationStatus) {
  try {
    assertOrgCan(action, { type, verificationStatus: status });
    return 'OK';
  } catch (err) {
    return (err as DomainError).code;
  }
}

describe('assertOrgCan (SPEC 8.1 table)', () => {
  it.each([
    ['PUBLISH_LISTING', 'SELLER', 'VERIFIED', 'OK'],
    ['PUBLISH_LISTING', 'SELLER', 'PENDING', 'ORG_NOT_VERIFIED'],
    ['SEND_OFFER', 'SELLER', 'UNVERIFIED', 'ORG_NOT_VERIFIED'],
    ['SEND_OFFER', 'BUYER', 'VERIFIED', 'FORBIDDEN'],
    ['CREATE_REQUEST', 'BUYER', 'UNVERIFIED', 'OK'],
    ['CREATE_REQUEST', 'BUYER', 'SUSPENDED', 'ORG_SUSPENDED'],
    ['ASSIGN_TO_SHIPMENT', 'CARRIER', 'VERIFIED', 'OK'],
    ['ASSIGN_TO_SHIPMENT', 'CARRIER', 'REJECTED', 'ORG_NOT_VERIFIED'],
    ['EDIT_PROFILE', 'CARRIER', 'REJECTED', 'OK'],
    ['EDIT_PROFILE', 'BUYER', 'SUSPENDED', 'ORG_SUSPENDED'],
    ['MANAGE_DRAFTS', 'SELLER', 'PENDING', 'OK'],
    ['MANAGE_FARMS', 'SELLER', 'UNVERIFIED', 'OK'],
    ['MANAGE_FARMS', 'BUYER', 'VERIFIED', 'FORBIDDEN'],
    ['MANAGE_FARMS', 'SELLER', 'SUSPENDED', 'ORG_SUSPENDED'],
  ] as const)('%s for %s/%s → %s', (action, type, status, expected) => {
    expect(result(action, type, status)).toBe(expected);
  });
});
