import { describe, expect, it } from 'vitest';

import type { MemberRole, OrgType } from '../enums.js';
import { type AccessSubject, canInOrg, canOnPlatform, type OrgAction } from './access.js';

const member = (role: MemberRole, orgType: OrgType = 'SELLER'): AccessSubject => ({
  platformRole: 'USER',
  membership: { role, orgType },
});

describe('canInOrg (SPEC 9)', () => {
  it.each([
    ['ORG_EDIT', 'OWNER', 'SELLER', true],
    ['ORG_EDIT', 'MANAGER', 'SELLER', false],
    ['ORG_EDIT', 'STAFF', 'BUYER', false],
    ['ORG_SUBMIT_VERIFICATION', 'OWNER', 'CARRIER', true],
    ['ORG_SUBMIT_VERIFICATION', 'MANAGER', 'CARRIER', false],
    ['MEMBERS_VIEW', 'STAFF', 'SELLER', true],
    ['MEMBERS_MANAGE', 'OWNER', 'BUYER', true],
    ['MEMBERS_MANAGE', 'MANAGER', 'BUYER', false],
    ['ORG_VIEW_PRIVATE', 'STAFF', 'CARRIER', true],
    ['ADDRESSES_VIEW', 'STAFF', 'BUYER', true],
    ['ADDRESSES_VIEW', 'OWNER', 'SELLER', false],
    ['ADDRESSES_MANAGE', 'MANAGER', 'BUYER', true],
    ['ADDRESSES_MANAGE', 'STAFF', 'BUYER', false],
    ['ADDRESSES_MANAGE', 'OWNER', 'CARRIER', false],
    ['FARMS_VIEW', 'STAFF', 'SELLER', true],
    ['FARMS_VIEW', 'OWNER', 'BUYER', false],
    ['FARMS_MANAGE', 'MANAGER', 'SELLER', true],
    ['FARMS_MANAGE', 'STAFF', 'SELLER', false],
    ['LISTINGS_VIEW', 'STAFF', 'SELLER', true],
    ['LISTINGS_MANAGE', 'OWNER', 'SELLER', true],
    ['LISTINGS_MANAGE', 'STAFF', 'SELLER', false],
    ['LISTINGS_MANAGE', 'OWNER', 'CARRIER', false],
    ['LISTING_CONFIRM', 'STAFF', 'SELLER', true],
    ['LISTING_CONFIRM', 'OWNER', 'BUYER', false],
  ] as const)('%s for %s of %s → %s', (action, role, type, expected) => {
    expect(canInOrg(member(role, type), action)).toBe(expected);
  });

  it('denies users without membership', () => {
    const actions: OrgAction[] = ['ORG_VIEW_PRIVATE', 'MEMBERS_VIEW', 'ORG_EDIT'];
    for (const action of actions) expect(canInOrg({ platformRole: 'USER' }, action)).toBe(false);
  });

  it('lets operators and admins act, but only an owner submits verification', () => {
    for (const platformRole of ['OPERATOR', 'ADMIN'] as const) {
      expect(canInOrg({ platformRole }, 'ORG_EDIT')).toBe(true);
      expect(canInOrg({ platformRole }, 'MEMBERS_MANAGE')).toBe(true);
      expect(canInOrg({ platformRole }, 'ORG_SUBMIT_VERIFICATION')).toBe(false);
      expect(
        canInOrg(
          { platformRole, membership: { role: 'OWNER', orgType: 'SELLER' } },
          'ORG_SUBMIT_VERIFICATION',
        ),
      ).toBe(true);
    }
  });
});

describe('canOnPlatform', () => {
  it.each([
    ['USER', 'ORG_VERIFY', false],
    ['OPERATOR', 'ORG_VERIFY', true],
    ['OPERATOR', 'OPS_TASKS', true],
    ['OPERATOR', 'SETTINGS_MANAGE', false],
    ['ADMIN', 'SETTINGS_MANAGE', true],
    ['OPERATOR', 'DICT_MANAGE', false],
    ['ADMIN', 'PLATFORM_ROLE_GRANT', true],
    ['USER', 'ADMIN_ORGS_VIEW', false],
  ] as const)('%s → %s: %s', (role, action, expected) => {
    expect(canOnPlatform(role, action)).toBe(expected);
  });
});

describe('M3 actions', () => {
  it.each([
    ['REQUESTS_VIEW', 'STAFF', 'BUYER', true],
    ['REQUESTS_MANAGE', 'MANAGER', 'BUYER', true],
    ['REQUESTS_MANAGE', 'STAFF', 'BUYER', false],
    ['REQUESTS_MANAGE', 'OWNER', 'SELLER', false],
    ['OFFERS_VIEW', 'STAFF', 'SELLER', true],
    ['OFFERS_MANAGE', 'OWNER', 'SELLER', true],
    ['OFFERS_MANAGE', 'STAFF', 'SELLER', false],
    ['OFFERS_MANAGE', 'OWNER', 'BUYER', false],
  ] as const)('%s for %s of %s → %s', (action, role, type, expected) => {
    expect(canInOrg(member(role, type), action)).toBe(expected);
  });

  it('lets operators review requests', () => {
    expect(canOnPlatform('OPERATOR', 'REQUEST_REVIEW')).toBe(true);
    expect(canOnPlatform('USER', 'REQUEST_REVIEW')).toBe(false);
  });
});
