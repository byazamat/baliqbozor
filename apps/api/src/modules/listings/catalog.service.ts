import { Prisma } from '@baliqbozor/db';
import {
  boundingBox,
  dateOnly,
  DomainError,
  ErrorCode,
  haversineKm,
  type LatLng,
  publicDistanceKm,
  weightToString,
} from '@baliqbozor/domain';
import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../providers/storage/storage.provider.js';
import { URL_TTL_SEC } from '../media/media.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { volumesOf } from './listing-view.js';
import type {
  CatalogQueryDto,
  PublicListingDto,
  PublicListingPageDto,
  PublicMediaDto,
} from './listings.dto.js';

const REGION = { select: { id: true, code: true, nameUz: true, nameRu: true } } as const;
const PUBLIC_INCLUDE = {
  farm: { select: { lat: true, lng: true, region: REGION } },
  seller: { select: { ratingAvg: true, ratingCount: true, reliabilityScore: true } },
  species: { select: { id: true, code: true, nameUz: true, nameRu: true } },
  sizeClass: { select: { id: true, code: true, labelUz: true, labelRu: true } },
  media: {
    where: { status: 'PROCESSED', kind: { in: ['IMAGE', 'VIDEO'] } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} as const satisfies Prisma.ListingInclude;
type PublicRow = Prisma.ListingGetPayload<{ include: typeof PUBLIC_INCLUDE }>;

const invalid = (field: string, constraint: string) =>
  new DomainError(ErrorCode.VALIDATION_FAILED, `Invalid ${field}`, {
    fields: [{ field, constraints: [constraint] }],
  });

export function parseNear(near: string | undefined): LatLng | null {
  if (!near) return null;
  const [lat, lng] = near.split(',').map(Number);
  if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw invalid('near', 'latLng');
  }
  return { lat, lng };
}

const encodeOffset = (offset: number) => Buffer.from(`o:${String(offset)}`).toString('base64url');
function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const m = /^o:(\d{1,7})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!m) throw invalid('cursor', 'invalidCursor');
  return Number(m[1]);
}

/**
 * Публичный каталог наличия (SPEC 10.3, 12.2, 13.1; D-53): только активные позиции проверенных
 * продавцов с доступным объёмом; расстояние — гаверсинус с отбором по прямоугольнику.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async search(q: CatalogQueryDto): Promise<PublicListingPageDto> {
    const near = parseNear(q.near);
    const sort = q.sort ?? 'score';
    if (sort === 'distance' && !near) throw invalid('near', 'requiredForSort');
    const limit = q.limit ?? 20;
    const offset = decodeOffset(q.cursor);

    const where: Prisma.Sql[] = [
      Prisma.sql`l.status = 'ACTIVE'`,
      Prisma.sql`l."volumeKg" - l."reservedKg" - l."soldKg" > 0`,
      Prisma.sql`f."isActive"`,
      Prisma.sql`o."verificationStatus" = 'VERIFIED'`,
    ];
    if (q.speciesId) where.push(Prisma.sql`l."speciesId" = ${q.speciesId}`);
    if (q.sizeClassId) where.push(Prisma.sql`l."sizeClassId" = ${q.sizeClassId}`);
    if (q.form) where.push(Prisma.sql`l.form = ${q.form}::"ProductForm"`);
    if (q.kind) where.push(Prisma.sql`l.kind = ${q.kind}::"ListingKind"`);
    if (q.regionId) where.push(Prisma.sql`f."regionId" = ${q.regionId}`);
    if (q.availableOn) {
      where.push(
        Prisma.sql`l."availableFrom" <= ${q.availableOn}::date
          AND (l."availableTo" IS NULL OR l."availableTo" >= ${q.availableOn}::date)`,
      );
    }
    if (q.maxPrice) {
      where.push(Prisma.sql`l."priceType" = 'FIXED' AND l."pricePerKg" <= ${BigInt(q.maxPrice)}`);
    }

    let distance = Prisma.sql`NULL::float8`;
    if (near) {
      const radius = q.radiusKm ?? (await this.settings.get('request.defaultRadiusKm'));
      const box = boundingBox(near, radius);
      distance = Prisma.sql`(2 * 6371 * asin(sqrt(
        power(sin(radians(f.lat::float8 - ${near.lat}) / 2), 2) +
        cos(radians(${near.lat})) * cos(radians(f.lat::float8)) *
        power(sin(radians(f.lng::float8 - ${near.lng}) / 2), 2))))`;
      where.push(
        Prisma.sql`f.lat BETWEEN ${box.minLat} AND ${box.maxLat}
          AND f.lng BETWEEN ${box.minLng} AND ${box.maxLng}`,
        Prisma.sql`${distance} <= ${radius}`,
      );
    }
    const order =
      sort === 'price'
        ? Prisma.sql`l."pricePerKg" ASC NULLS LAST, l.id`
        : sort === 'distance' || (sort === 'score' && near)
          ? Prisma.sql`distance ASC, l.id`
          : Prisma.sql`l."lastConfirmedAt" DESC NULLS LAST, l.id`;

    const hits = await this.prisma.client.$queryRaw<{ id: string; distance: number | null }[]>`
      SELECT l.id, ${distance} AS distance
      FROM "Listing" l
      JOIN "Farm" f ON f.id = l."farmId"
      JOIN "Organization" o ON o.id = l."sellerOrgId"
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${order}
      LIMIT ${limit + 1} OFFSET ${offset}`;

    const page = hits.slice(0, limit);
    const rows = await this.prisma.client.listing.findMany({
      where: { id: { in: page.map((h) => h.id) } },
      include: PUBLIC_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = await Promise.all(
      page.flatMap((h) => {
        const row = byId.get(h.id);
        return row ? [this.toPublic(row, h.distance, true)] : [];
      }),
    );
    return { items, nextCursor: hits.length > limit ? encodeOffset(offset + limit) : null };
  }

  /** Публичная карточка: активная или распроданная позиция проверенного продавца. */
  async card(id: string, near: LatLng | null): Promise<PublicListingDto> {
    const row = await this.prisma.client.listing.findFirst({
      where: {
        id,
        status: { in: ['ACTIVE', 'SOLD_OUT'] },
        seller: { verificationStatus: 'VERIFIED' },
        farm: { isActive: true },
      },
      include: PUBLIC_INCLUDE,
    });
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Listing not found');
    const distance = near
      ? haversineKm(near, { lat: Number(row.farm.lat), lng: Number(row.farm.lng) })
      : null;
    return this.toPublic(row, distance, false);
  }

  private async toPublic(
    l: PublicRow,
    distance: number | null,
    coverOnly: boolean,
  ): Promise<PublicListingDto> {
    const v = volumesOf(l);
    const images = l.media.filter((m) => m.kind === 'IMAGE');
    const shown = coverOnly ? images.slice(0, 1) : l.media;
    return {
      id: l.id,
      status: l.status === 'SOLD_OUT' ? 'SOLD_OUT' : 'ACTIVE',
      species: l.species,
      sizeClass: l.sizeClass,
      form: l.form,
      kind: l.kind,
      availableKg: weightToString(v.availableKg.isNegative() ? 0 : v.availableKg),
      minOrderKg: weightToString(l.minOrderKg),
      priceType: l.priceType,
      pricePerKg: l.pricePerKg?.toString() ?? null,
      availableFrom: dateOnly(l.availableFrom),
      availableTo: l.availableTo ? dateOnly(l.availableTo) : null,
      description: l.description,
      hasVideo: l.media.some((m) => m.kind === 'VIDEO'),
      lastConfirmedAt: l.lastConfirmedAt,
      publishedAt: l.publishedAt,
      region: l.farm.region,
      seller: {
        ratingAvg: l.seller.ratingAvg?.toFixed(2) ?? null,
        ratingCount: l.seller.ratingCount,
        reliabilityScore: l.seller.reliabilityScore?.toFixed(2) ?? null,
      },
      distanceKm: distance === null ? null : publicDistanceKm(distance),
      media: await Promise.all(shown.map((m) => this.publicMedia(m))),
      mediaCount: l.media.length,
      priceIndex: null,
    };
  }

  private async publicMedia(m: PublicRow['media'][number]): Promise<PublicMediaDto> {
    return {
      id: m.id,
      kind: m.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      url: await this.storage.presignGet(m.storageKey, URL_TTL_SEC),
      thumbUrl: m.thumbnailKey ? await this.storage.presignGet(m.thumbnailKey, URL_TTL_SEC) : null,
      width: m.width,
      height: m.height,
      durationSec: m.durationSec,
    };
  }
}
