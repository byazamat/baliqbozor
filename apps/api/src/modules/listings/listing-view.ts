import { type Prisma } from '@baliqbozor/db';
import { availableKg, dateOnly, freshnessDueAt, weightToString } from '@baliqbozor/domain';

import { toMediaDto } from '../media/media.dto.js';
import type { ListingDto } from './listings.dto.js';

const REGION = { select: { id: true, code: true, nameUz: true, nameRu: true } } as const;

export const LISTING_INCLUDE = {
  farm: { select: { id: true, name: true, isActive: true, region: REGION } },
  species: { select: { id: true, code: true, nameUz: true, nameRu: true } },
  sizeClass: { select: { id: true, code: true, labelUz: true, labelRu: true } },
  media: {
    where: { status: { not: 'REJECTED' } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} as const satisfies Prisma.ListingInclude;

export type ListingRow = Prisma.ListingGetPayload<{ include: typeof LISTING_INCLUDE }>;

/** Объёмы строки как строки API (Decimal → `"1250.500"`). */
export function volumesOf(l: {
  volumeKg: { toString(): string };
  reservedKg: { toString(): string };
  soldKg: { toString(): string };
}) {
  const v = {
    volumeKg: l.volumeKg.toString(),
    reservedKg: l.reservedKg.toString(),
    soldKg: l.soldKg.toString(),
  };
  return { ...v, availableKg: availableKg(v) };
}

export function toListingDto(l: ListingRow, freshnessDays: number): ListingDto {
  const v = volumesOf(l);
  return {
    id: l.id,
    farm: l.farm,
    species: l.species,
    sizeClass: l.sizeClass,
    form: l.form,
    kind: l.kind,
    status: l.status,
    pauseReason: l.pauseReason,
    volumeKg: weightToString(v.volumeKg),
    reservedKg: weightToString(v.reservedKg),
    soldKg: weightToString(v.soldKg),
    availableKg: weightToString(v.availableKg),
    minOrderKg: weightToString(l.minOrderKg),
    priceType: l.priceType,
    pricePerKg: l.pricePerKg?.toString() ?? null,
    availableFrom: dateOnly(l.availableFrom),
    availableTo: l.availableTo ? dateOnly(l.availableTo) : null,
    description: l.description,
    hasVideo: l.media.some((m) => m.kind === 'VIDEO' && m.status === 'PROCESSED'),
    lastConfirmedAt: l.lastConfirmedAt,
    freshnessDueAt:
      l.status === 'ACTIVE' && l.lastConfirmedAt
        ? freshnessDueAt(l.lastConfirmedAt, freshnessDays)
        : null,
    publishedAt: l.publishedAt,
    media: l.media.map(toMediaDto),
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}
