import type { PrismaClient } from '../generated/prisma/client.js';
import type { ListingKind, ListingStatus, PriceType } from '../generated/prisma/enums.js';
import { DEMO_ORGS, demoPhone } from './demo.js';

/** Картинки демо-наличия из `seed-assets/` (D-47, M2.10). */
export const DEMO_IMAGES = ['silver-carp.jpg', 'carp.jpg', 'trout.jpg'] as const;
export type DemoImage = (typeof DEMO_IMAGES)[number];

/** Запись файла в хранилище; без него демо-наличие создаётся без фото и остаётся черновиком. */
export type PutObject = (key: string, image: DemoImage) => Promise<void>;

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const farmId = (n: number) => id('d1000000', n);
const listingId = (n: number) => id('d2000000', n);
const mediaId = (n: number) => id('d3000000', n);

interface DemoFarm {
  n: number;
  org: number;
  name: string;
  region: string;
  districtName: string;
  lat: string;
  lng: string;
}

/** Хозяйства продавцов из `DEMO_ORGS` (номер — индекс организации, с 1). */
const FARMS: readonly DemoFarm[] = [
  {
    n: 1,
    org: 1,
    name: 'Zarafshon hovuzlari',
    region: 'SAMARKAND',
    districtName: 'Urgut',
    lat: '39.402100',
    lng: '67.243500',
  },
  {
    n: 2,
    org: 1,
    name: 'Kattaqo‘rg‘on suv ombori',
    region: 'SAMARKAND',
    districtName: 'Kattaqo‘rg‘on',
    lat: '39.900000',
    lng: '66.300000',
  },
  {
    n: 3,
    org: 2,
    name: 'Jizzax Akva — 1',
    region: 'JIZZAKH',
    districtName: 'Zomin',
    lat: '40.115800',
    lng: '67.842200',
  },
  {
    n: 4,
    org: 3,
    name: 'Chorvoq forel',
    region: 'TASHKENT',
    districtName: 'Bo‘stonliq',
    lat: '41.620000',
    lng: '70.030000',
  },
];

interface DemoListing {
  n: number;
  farm: number;
  species: string;
  size: string;
  kind: ListingKind;
  volumeKg: number;
  priceType: PriceType;
  pricePerKg: bigint | null;
  fromDays: number;
  toDays: number | null;
  status: ListingStatus;
  image: DemoImage;
  description: string;
}

const LISTINGS: readonly DemoListing[] = [
  {
    n: 1,
    farm: 1,
    species: 'SILVER_CARP',
    size: '1-2',
    kind: 'AVAILABLE_NOW',
    volumeKg: 2000,
    priceType: 'FIXED',
    pricePerKg: 26_000n,
    fromDays: 1,
    toDays: 30,
    status: 'ACTIVE',
    image: 'silver-carp.jpg',
    description: 'Tirik do‘ngpeshona, kontrol ovlash har hafta.',
  },
  {
    n: 2,
    farm: 2,
    species: 'CARP',
    size: '1-2',
    kind: 'AVAILABLE_NOW',
    volumeKg: 1500,
    priceType: 'FIXED',
    pricePerKg: 28_000n,
    fromDays: 0,
    toDays: 21,
    status: 'ACTIVE',
    image: 'carp.jpg',
    description: 'Karp, 1–2 kg, sog‘lom.',
  },
  {
    n: 3,
    farm: 3,
    species: 'SILVER_CARP',
    size: '1-2',
    kind: 'AVAILABLE_NOW',
    volumeKg: 1000,
    priceType: 'FIXED',
    pricePerKg: 25_000n,
    fromDays: 2,
    toDays: 25,
    status: 'ACTIVE',
    image: 'silver-carp.jpg',
    description: 'Живой толстолобик, отгрузка с понедельника.',
  },
  {
    n: 4,
    farm: 3,
    species: 'CARP',
    size: '2-3',
    kind: 'FUTURE_HARVEST',
    volumeKg: 5000,
    priceType: 'NEGOTIABLE',
    pricePerKg: null,
    fromDays: 45,
    toDays: null,
    status: 'ACTIVE',
    image: 'carp.jpg',
    description: 'Kuzgi hosil, narx kelishiladi.',
  },
  {
    n: 5,
    farm: 1,
    species: 'GRASS_CARP',
    size: '1-2',
    kind: 'AVAILABLE_NOW',
    volumeKg: 800,
    priceType: 'FIXED',
    pricePerKg: 27_000n,
    fromDays: 0,
    toDays: 14,
    status: 'PAUSED',
    image: 'carp.jpg',
    description: 'Oq amur.',
  },
  {
    n: 6,
    farm: 4,
    species: 'RAINBOW_TROUT',
    size: '0.25-0.4',
    kind: 'AVAILABLE_NOW',
    volumeKg: 300,
    priceType: 'FIXED',
    pricePerKg: 65_000n,
    fromDays: 3,
    toDays: null,
    status: 'DRAFT',
    image: 'trout.jpg',
    description: 'Форель из горной воды.',
  },
];

const DAY = 24 * 60 * 60 * 1000;
const dateIn = (days: number, now: Date) =>
  new Date(
    `${new Date(now.getTime() + 5 * 60 * 60 * 1000 + days * DAY).toISOString().slice(0, 10)}T00:00:00Z`,
  );

/**
 * Демо хозяйств и наличия M2: идемпотентно (фиксированные id; существующие записи не меняются —
 * их могли поправить вручную, а свежесть идёт своим ходом). Требует `seedReference` и `seedDemo`.
 */
export async function seedDemoCatalog(
  prisma: PrismaClient,
  putObject: PutObject | null,
  now = new Date(),
): Promise<{ farms: number; listings: number }> {
  const orgOf = (n: number) => {
    const org = DEMO_ORGS[n - 1];
    if (!org) throw new Error(`Demo org ${String(n)} missing`);
    return org;
  };
  for (const f of FARMS) {
    const region = await prisma.region.findUniqueOrThrow({ where: { code: f.region } });
    await prisma.farm.upsert({
      where: { id: farmId(f.n) },
      create: {
        id: farmId(f.n),
        sellerOrgId: orgOf(f.org).id,
        name: f.name,
        regionId: region.id,
        districtName: f.districtName,
        lat: f.lat,
        lng: f.lng,
        waterBodyTypes: f.org === 3 ? ['RACEWAY'] : ['POND'],
        areaHa: f.org === 3 ? '1.50' : '24.00',
      },
      update: {},
    });
  }
  for (const l of LISTINGS) {
    const farm = FARMS.find((f) => f.n === l.farm);
    if (!farm) throw new Error(`Demo farm ${String(l.farm)} missing`);
    const org = orgOf(farm.org);
    const species = await prisma.fishSpecies.findUniqueOrThrow({ where: { code: l.species } });
    const size = await prisma.sizeClass.findUniqueOrThrow({
      where: { speciesId_code: { speciesId: species.id, code: l.size } },
    });
    const owner = await prisma.user.findUniqueOrThrow({
      where: { phone: demoPhone(org.owner) },
    });
    const exists = await prisma.listing.findUnique({ where: { id: listingId(l.n) } });
    if (exists) continue;
    // Без хранилища фото не будет, а без фото позиция не публикуется (D-51).
    const status: ListingStatus = putObject ? l.status : 'DRAFT';
    await prisma.listing.create({
      data: {
        id: listingId(l.n),
        sellerOrgId: org.id,
        farmId: farmId(farm.n),
        speciesId: species.id,
        sizeClassId: size.id,
        form: 'LIVE',
        kind: l.kind,
        volumeKg: l.volumeKg,
        minOrderKg: 100,
        priceType: l.priceType,
        pricePerKg: l.pricePerKg,
        availableFrom: dateIn(l.fromDays, now),
        availableTo: l.toDays === null ? null : dateIn(l.toDays, now),
        description: l.description,
        status,
        pauseReason: status === 'PAUSED' ? 'FRESHNESS' : null,
        lastConfirmedAt:
          status === 'DRAFT' ? null : new Date(now.getTime() - (status === 'PAUSED' ? 8 : 1) * DAY),
        publishedAt: status === 'DRAFT' ? null : new Date(now.getTime() - 10 * DAY),
        createdById: owner.id,
      },
    });
    if (putObject) {
      const key = `listing_media/${org.id}/${mediaId(l.n)}.processed`;
      await putObject(key, l.image);
      await prisma.mediaFile.upsert({
        where: { id: mediaId(l.n) },
        create: {
          id: mediaId(l.n),
          uploaderId: owner.id,
          orgId: org.id,
          listingId: listingId(l.n),
          purpose: 'LISTING_MEDIA',
          kind: 'IMAGE',
          status: 'PROCESSED',
          mimeType: 'image/jpeg',
          sizeBytes: 10_000,
          width: 960,
          height: 640,
          storageKey: key,
        },
        update: {},
      });
    }
  }
  return { farms: FARMS.length, listings: LISTINGS.length };
}

/** Владельцы продавцов демо — для подсказки в выводе seed. */
export const demoSellerPhones = () =>
  DEMO_ORGS.filter((o) => o.type === 'SELLER').map((o) => demoPhone(o.owner));
