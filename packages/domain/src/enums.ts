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

export const ProductForm = { LIVE: 'LIVE', CHILLED: 'CHILLED' } as const;
export type ProductForm = (typeof ProductForm)[keyof typeof ProductForm];

export const WaterBodyType = {
  POND: 'POND',
  RAS: 'RAS',
  CAGE: 'CAGE',
  RACEWAY: 'RACEWAY',
  OTHER: 'OTHER',
} as const;
export type WaterBodyType = (typeof WaterBodyType)[keyof typeof WaterBodyType];

export const PriceType = { FIXED: 'FIXED', NEGOTIABLE: 'NEGOTIABLE' } as const;
export type PriceType = (typeof PriceType)[keyof typeof PriceType];

export const ListingKind = {
  AVAILABLE_NOW: 'AVAILABLE_NOW',
  FUTURE_HARVEST: 'FUTURE_HARVEST',
} as const;
export type ListingKind = (typeof ListingKind)[keyof typeof ListingKind];

export const ListingStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  SOLD_OUT: 'SOLD_OUT',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

/** Служебное (D-51): причина паузы наличия. */
export const ListingPauseReason = {
  MANUAL: 'MANUAL',
  FRESHNESS: 'FRESHNESS',
  FARM_INACTIVE: 'FARM_INACTIVE',
} as const;
export type ListingPauseReason = (typeof ListingPauseReason)[keyof typeof ListingPauseReason];

export const RequestStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  OPEN: 'OPEN',
  OFFERS_RECEIVED: 'OFFERS_RECEIVED',
  ORDERED: 'ORDERED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];

export const OfferStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  PARTIALLY_ACCEPTED: 'PARTIALLY_ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  EXPIRED: 'EXPIRED',
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];
