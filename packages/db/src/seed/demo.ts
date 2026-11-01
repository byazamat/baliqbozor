import type { PrismaClient } from '../generated/prisma/client.js';
import type {
  LegalForm,
  OrgType,
  PlatformRole,
  VerificationStatus,
} from '../generated/prisma/enums.js';

/** Демо-данные разрешены только локально и на staging (SPEC 7.3, D-36). */
export const DEMO_ENVS = ['local', 'staging'] as const;

export const demoPhone = (n: number) => `+9989000000${String(n).padStart(2, '0')}`;

interface DemoUser {
  n: number;
  fullName: string;
  platformRole: PlatformRole;
  locale: 'uz' | 'ru';
}

interface DemoOrg {
  id: string;
  owner: number;
  type: OrgType;
  legalForm: LegalForm;
  name: string;
  tin: string | null;
  region: string;
  status: VerificationStatus;
}

/** Пользователи: +998900000001 — оператор, …02 — администратор, далее владельцы организаций. */
export const DEMO_USERS: readonly DemoUser[] = [
  { n: 1, fullName: 'Dilnoza Operatorova', platformRole: 'OPERATOR', locale: 'ru' },
  { n: 2, fullName: 'Aziz Adminov', platformRole: 'ADMIN', locale: 'ru' },
  { n: 3, fullName: 'Rustam Karimov', platformRole: 'USER', locale: 'uz' },
  { n: 4, fullName: 'Shoxrux Aliyev', platformRole: 'USER', locale: 'uz' },
  { n: 5, fullName: 'Олег Ким', platformRole: 'USER', locale: 'ru' },
  { n: 6, fullName: 'Madina Yusupova', platformRole: 'USER', locale: 'uz' },
  { n: 7, fullName: 'Сергей Петров', platformRole: 'USER', locale: 'ru' },
  { n: 8, fullName: 'Jasur Toshmatov', platformRole: 'USER', locale: 'uz' },
  { n: 9, fullName: 'Bobur Ergashev', platformRole: 'USER', locale: 'uz' },
  { n: 10, fullName: 'Алишер Насыров', platformRole: 'USER', locale: 'ru' },
];

const demoId = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Организации без хозяйств и машин — они появятся в M2 и M5. */
export const DEMO_ORGS: readonly DemoOrg[] = [
  {
    id: demoId(1),
    owner: 3,
    type: 'SELLER',
    legalForm: 'FARM_ENTERPRISE',
    name: 'Samarqand Baliq',
    tin: '301000001',
    region: 'SAMARKAND',
    status: 'VERIFIED',
  },
  {
    id: demoId(2),
    owner: 4,
    type: 'SELLER',
    legalForm: 'LLC',
    name: 'Jizzax Akva',
    tin: '301000002',
    region: 'JIZZAKH',
    status: 'VERIFIED',
  },
  {
    id: demoId(3),
    owner: 5,
    type: 'SELLER',
    legalForm: 'DEHKAN_FARM',
    name: 'Chorvoq Forel',
    tin: '301000003',
    region: 'TASHKENT',
    status: 'UNVERIFIED',
  },
  {
    id: demoId(4),
    owner: 6,
    type: 'BUYER',
    legalForm: 'LLC',
    name: 'Restoran Navro‘z',
    tin: '302000001',
    region: 'TASHKENT_CITY',
    status: 'VERIFIED',
  },
  {
    id: demoId(5),
    owner: 7,
    type: 'BUYER',
    legalForm: 'SOLE_PROPRIETOR',
    name: 'Магазин «Свежая рыба»',
    tin: '302000002',
    region: 'TASHKENT_CITY',
    status: 'UNVERIFIED',
  },
  {
    id: demoId(6),
    owner: 8,
    type: 'BUYER',
    legalForm: 'LLC',
    name: 'Buxoro Ulgurji',
    tin: '302000003',
    region: 'BUKHARA',
    status: 'UNVERIFIED',
  },
  {
    id: demoId(7),
    owner: 9,
    type: 'CARRIER',
    legalForm: 'SOLE_PROPRIETOR',
    name: 'Tez Yetkazish',
    tin: '303000001',
    region: 'TASHKENT',
    status: 'VERIFIED',
  },
  {
    id: demoId(8),
    owner: 10,
    type: 'CARRIER',
    legalForm: 'INDIVIDUAL',
    name: 'Живая рыба — перевозки',
    tin: null,
    region: 'SAMARKAND',
    status: 'UNVERIFIED',
  },
];

/**
 * Демо-данные M1 (D-36): оператор, администратор, 3 продавца, 3 покупателя, 2 перевозчика
 * с владельцами. Идемпотентно (upsert по телефону и фиксированным id организаций).
 * Требует справочник регионов (`seedReference`).
 */
export async function seedDemo(prisma: PrismaClient): Promise<{ users: number; orgs: number }> {
  await prisma.$transaction(async (tx) => {
    const userIds = new Map<number, string>();
    for (const u of DEMO_USERS) {
      const phone = demoPhone(u.n);
      const user = await tx.user.upsert({
        where: { phone },
        create: { phone, fullName: u.fullName, platformRole: u.platformRole, locale: u.locale },
        update: { fullName: u.fullName, platformRole: u.platformRole },
      });
      userIds.set(u.n, user.id);
    }
    const operatorId = userIds.get(1) ?? null;
    for (const o of DEMO_ORGS) {
      const ownerId = userIds.get(o.owner);
      if (!ownerId) throw new Error(`Demo owner ${String(o.owner)} missing`);
      const region = await tx.region.findUniqueOrThrow({ where: { code: o.region } });
      const verified = o.status === 'VERIFIED';
      const data = {
        type: o.type,
        legalForm: o.legalForm,
        name: o.name,
        tin: o.tin,
        regionId: region.id,
        contactPhone: demoPhone(o.owner),
        verificationStatus: o.status,
        verifiedAt: verified ? new Date('2026-10-01T09:00:00Z') : null,
        verifiedById: verified ? operatorId : null,
      };
      await tx.organization.upsert({
        where: { id: o.id },
        create: { id: o.id, ...data },
        update: data,
      });
      await tx.membership.upsert({
        where: { userId_orgId: { userId: ownerId, orgId: o.id } },
        create: { userId: ownerId, orgId: o.id, role: 'OWNER' },
        update: { role: 'OWNER' },
      });
    }
  });
  return { users: DEMO_USERS.length, orgs: DEMO_ORGS.length };
}
