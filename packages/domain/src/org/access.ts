import type { MemberRole, OrgType, PlatformRole } from '../enums.js';

/** Действия из матрицы прав SPEC 9 (M1 и M2; дополняется в следующих milestone). */
export type OrgAction =
  | 'ORG_VIEW_PRIVATE'
  | 'ORG_EDIT'
  | 'ORG_SUBMIT_VERIFICATION'
  | 'MEMBERS_VIEW'
  | 'MEMBERS_MANAGE'
  | 'ADDRESSES_VIEW'
  | 'ADDRESSES_MANAGE'
  | 'FARMS_VIEW'
  | 'FARMS_MANAGE'
  | 'LISTINGS_VIEW'
  | 'LISTINGS_MANAGE'
  | 'LISTING_CONFIRM';

export type PlatformAction =
  | 'ORG_VERIFY'
  | 'OPS_TASKS'
  | 'ADMIN_ORGS_VIEW'
  | 'SETTINGS_MANAGE'
  | 'DICT_MANAGE'
  | 'PLATFORM_ROLE_GRANT';

export interface AccessSubject {
  platformRole: PlatformRole;
  /** Членство в организации из `X-Org-Id`, если есть. */
  membership?: { role: MemberRole; orgType: OrgType } | undefined;
}

const isStaffPlatform = (r: PlatformRole) => r === 'OPERATOR' || r === 'ADMIN';

type Rule = (m: { role: MemberRole; orgType: OrgType }) => boolean;

const ORG_RULES: Readonly<Record<OrgAction, Rule>> = {
  ORG_VIEW_PRIVATE: () => true,
  ORG_EDIT: (m) => m.role === 'OWNER',
  ORG_SUBMIT_VERIFICATION: (m) => m.role === 'OWNER',
  MEMBERS_VIEW: () => true,
  MEMBERS_MANAGE: (m) => m.role === 'OWNER',
  // Адреса доставки — покупатель (D-39): все члены видят, OWNER/MANAGER меняют.
  ADDRESSES_VIEW: (m) => m.orgType === 'BUYER',
  ADDRESSES_MANAGE: (m) => m.orgType === 'BUYER' && m.role !== 'STAFF',
  // Хозяйства и наличие (SPEC 9): STAFF продавца только смотрит и подтверждает свежесть (D-15).
  FARMS_VIEW: (m) => m.orgType === 'SELLER',
  FARMS_MANAGE: (m) => m.orgType === 'SELLER' && m.role !== 'STAFF',
  LISTINGS_VIEW: (m) => m.orgType === 'SELLER',
  LISTINGS_MANAGE: (m) => m.orgType === 'SELLER' && m.role !== 'STAFF',
  LISTING_CONFIRM: (m) => m.orgType === 'SELLER',
};

/** Права внутри организации; оператор и администратор допускаются ко всем действиям. */
export function canInOrg(subject: AccessSubject, action: OrgAction): boolean {
  if (isStaffPlatform(subject.platformRole)) {
    return action !== 'ORG_SUBMIT_VERIFICATION' || subject.membership?.role === 'OWNER';
  }
  return subject.membership ? ORG_RULES[action](subject.membership) : false;
}

const PLATFORM_RULES: Readonly<Record<PlatformAction, readonly PlatformRole[]>> = {
  ORG_VERIFY: ['OPERATOR', 'ADMIN'],
  OPS_TASKS: ['OPERATOR', 'ADMIN'],
  ADMIN_ORGS_VIEW: ['OPERATOR', 'ADMIN'],
  SETTINGS_MANAGE: ['ADMIN'],
  DICT_MANAGE: ['ADMIN'],
  PLATFORM_ROLE_GRANT: ['ADMIN'],
};

export function canOnPlatform(role: PlatformRole, action: PlatformAction): boolean {
  return PLATFORM_RULES[action].includes(role);
}
