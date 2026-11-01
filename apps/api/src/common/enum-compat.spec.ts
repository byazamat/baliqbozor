import * as db from '@baliqbozor/db';
import * as domain from '@baliqbozor/domain';

/** Тип-равенство: ошибка компиляции, если enum-ы домена и Prisma разойдутся (D-39, M1.1). */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertTrue = <T extends true>(value: T) => value;

describe('domain enums match the Prisma schema', () => {
  it('has identical types', () => {
    assertTrue<Equals<domain.PlatformRole, db.PlatformRole>>(true);
    assertTrue<Equals<domain.OrgType, db.OrgType>>(true);
    assertTrue<Equals<domain.MemberRole, db.MemberRole>>(true);
    assertTrue<Equals<domain.VerificationStatus, db.VerificationStatus>>(true);
    assertTrue<Equals<domain.LegalForm, db.LegalForm>>(true);
    assertTrue<Equals<domain.ProductForm, db.ProductForm>>(true);
    assertTrue<Equals<domain.WaterBodyType, db.WaterBodyType>>(true);
    assertTrue<Equals<domain.PriceType, db.PriceType>>(true);
    assertTrue<Equals<domain.ListingKind, db.ListingKind>>(true);
    assertTrue<Equals<domain.ListingStatus, db.ListingStatus>>(true);
    assertTrue<Equals<domain.ListingPauseReason, db.ListingPauseReason>>(true);
    assertTrue<Equals<domain.MediaPurpose, db.MediaPurpose>>(true);
    assertTrue<Equals<domain.MediaKind, db.MediaKind>>(true);
    assertTrue<Equals<domain.RequestStatus, db.RequestStatus>>(true);
    assertTrue<Equals<domain.OfferStatus, db.OfferStatus>>(true);
  });

  it('has identical runtime values', () => {
    for (const name of [
      'PlatformRole',
      'OrgType',
      'MemberRole',
      'VerificationStatus',
      'LegalForm',
      'ProductForm',
      'WaterBodyType',
      'PriceType',
      'ListingKind',
      'ListingStatus',
      'ListingPauseReason',
      'MediaPurpose',
      'MediaKind',
      'RequestStatus',
      'OfferStatus',
    ] as const) {
      expect(domain[name]).toEqual(db[name]);
    }
  });
});
