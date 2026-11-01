/**
 * Значения enum-ов схемы БД (SPEC 7.2), нужные бизнес-правилам. Домен не зависит от
 * `@baliqbozor/db`; совпадение с Prisma проверяется тестом совместимости типов в api.
 */
export const PlatformRole = { USER: 'USER', OPERATOR: 'OPERATOR', ADMIN: 'ADMIN' } as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export const OrgType = { SELLER: 'SELLER', BUYER: 'BUYER', CARRIER: 'CARRIER' } as const;
export type OrgType = (typeof OrgType)[keyof typeof OrgType];

export const MemberRole = { OWNER: 'OWNER', MANAGER: 'MANAGER', STAFF: 'STAFF' } as const;
export type MemberRole = (typeof MemberRole)[keyof typeof MemberRole];

export const VerificationStatus = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const LegalForm = {
  INDIVIDUAL: 'INDIVIDUAL',
  SOLE_PROPRIETOR: 'SOLE_PROPRIETOR',
  LLC: 'LLC',
  FARM_ENTERPRISE: 'FARM_ENTERPRISE',
  DEHKAN_FARM: 'DEHKAN_FARM',
  OTHER: 'OTHER',
} as const;
export type LegalForm = (typeof LegalForm)[keyof typeof LegalForm];
