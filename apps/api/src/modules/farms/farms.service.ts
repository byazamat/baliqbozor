import { type Prisma, type TransactionClient } from '@baliqbozor/db';
import { assertValidFarm, DomainError, ErrorCode, nextListingState } from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import type { AuthContext } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { recordEvent } from '../../infra/events.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { assertCanInOrg, assertOrgStatusAllows, requireOrg } from '../auth/policy.js';
import { attachMedia } from '../media/media-attach.js';
import { toMediaDto } from '../media/media.dto.js';
import type { CreateFarmDto, FarmDto, UpdateFarmDto } from './farms.dto.js';

const INCLUDE = {
  region: { select: { id: true, code: true, nameUz: true, nameRu: true } },
  media: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  _count: { select: { listings: { where: { status: 'ACTIVE' } } } },
} as const satisfies Prisma.FarmInclude;
type Row = Prisma.FarmGetPayload<{ include: typeof INCLUDE }>;

const toDto = (f: Row): FarmDto => ({
  id: f.id,
  sellerOrgId: f.sellerOrgId,
  name: f.name,
  region: f.region,
  districtName: f.districtName,
  addressText: f.addressText,
  lat: f.lat.toFixed(6),
  lng: f.lng.toFixed(6),
  waterBodyTypes: f.waterBodyTypes,
  areaHa: f.areaHa?.toFixed(2) ?? null,
  description: f.description,
  isActive: f.isActive,
  photos: f.media.filter((m) => m.status !== 'REJECTED').map(toMediaDto),
  activeListings: f._count.listings,
  createdAt: f.createdAt,
  updatedAt: f.updatedAt,
});

const FARM_FIELDS = [
  'name',
  'regionId',
  'districtName',
  'addressText',
  'lat',
  'lng',
  'waterBodyTypes',
  'areaHa',
  'description',
  'isActive',
  'mediaIds',
] as const;

/** Хозяйства продавца (SPEC 8.2, 10.3): создание, правка, фото, деактивация с паузой наличия. */
@Injectable()
export class FarmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext): Promise<FarmDto[]> {
    assertCanInOrg(auth, 'FARMS_VIEW');
    const rows = await this.prisma.client.farm.findMany({
      where: { sellerOrgId: requireOrg(auth).id },
      include: INCLUDE,
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDto);
  }

  async get(auth: AuthContext, id: string): Promise<FarmDto> {
    assertCanInOrg(auth, 'FARMS_VIEW');
    return toDto(await this.findOwn(this.prisma.client, requireOrg(auth).id, id));
  }

  async create(auth: AuthContext, dto: CreateFarmDto): Promise<FarmDto> {
    assertCanInOrg(auth, 'FARMS_MANAGE');
    assertOrgStatusAllows(auth, 'MANAGE_FARMS');
    const orgId = requireOrg(auth).id;
    assertValidFarm({
      name: dto.name,
      lat: Number(dto.lat),
      lng: Number(dto.lng),
      waterBodyTypes: dto.waterBodyTypes,
      areaHa: dto.areaHa === undefined ? undefined : Number(dto.areaHa),
    });
    await this.assertRegion(dto.regionId);
    return this.prisma.client.$transaction(async (tx) => {
      const farm = await tx.farm.create({
        data: {
          sellerOrgId: orgId,
          name: dto.name.trim(),
          regionId: dto.regionId,
          districtName: dto.districtName?.trim() || null,
          addressText: dto.addressText?.trim() || null,
          lat: dto.lat,
          lng: dto.lng,
          waterBodyTypes: [...new Set(dto.waterBodyTypes)],
          areaHa: dto.areaHa ?? null,
          description: dto.description?.trim() || null,
        },
      });
      if (dto.mediaIds?.length) {
        await attachMedia(tx, {
          orgId,
          purpose: 'FARM_PHOTO',
          mediaIds: dto.mediaIds,
          target: { farmId: farm.id },
        });
      }
      const row = await this.findOwn(tx, orgId, farm.id);
      await recordEvent(tx, 'farm.created', farm.id, {
        farmId: farm.id,
        orgId,
        actorUserId: auth.userId,
      });
      await this.audit.record(tx, {
        action: 'farm.create',
        entityType: 'Farm',
        entityId: farm.id,
        after: auditView(row),
      });
      return toDto(row);
    });
  }

  async update(auth: AuthContext, id: string, dto: UpdateFarmDto): Promise<FarmDto> {
    assertCanInOrg(auth, 'FARMS_MANAGE');
    assertOrgStatusAllows(auth, 'MANAGE_FARMS');
    const orgId = requireOrg(auth).id;
    assertValidFarm(
      {
        name: dto.name,
        lat: dto.lat === undefined ? undefined : Number(dto.lat),
        lng: dto.lng === undefined ? undefined : Number(dto.lng),
        waterBodyTypes: dto.waterBodyTypes,
        areaHa: dto.areaHa === undefined ? undefined : Number(dto.areaHa),
      },
      true,
    );
    if (dto.regionId !== undefined) await this.assertRegion(dto.regionId);
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Farm" WHERE id = ${id}::uuid FOR UPDATE`;
      const before = await this.findOwn(tx, orgId, id);
      await tx.farm.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.regionId !== undefined ? { regionId: dto.regionId } : {}),
          ...(dto.districtName !== undefined
            ? { districtName: dto.districtName.trim() || null }
            : {}),
          ...(dto.addressText !== undefined ? { addressText: dto.addressText.trim() || null } : {}),
          ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
          ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
          ...(dto.waterBodyTypes !== undefined
            ? { waterBodyTypes: [...new Set(dto.waterBodyTypes)] }
            : {}),
          ...(dto.areaHa !== undefined ? { areaHa: dto.areaHa } : {}),
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      if (dto.mediaIds !== undefined) {
        await attachMedia(tx, {
          orgId,
          purpose: 'FARM_PHOTO',
          mediaIds: dto.mediaIds,
          target: { farmId: id },
        });
      }
      const fields = FARM_FIELDS.filter((f) => dto[f] !== undefined);
      if (before.isActive && dto.isActive === false) {
        const paused = await this.pauseActiveListings(tx, orgId, id, auth.userId);
        await recordEvent(tx, 'farm.deactivated', id, {
          farmId: id,
          orgId,
          pausedListingIds: paused,
          actorUserId: auth.userId,
        });
      }
      if (fields.length > 0) {
        await recordEvent(tx, 'farm.updated', id, {
          farmId: id,
          orgId,
          fields: [...fields],
          actorUserId: auth.userId,
        });
      }
      const row = await this.findOwn(tx, orgId, id);
      await this.audit.record(tx, {
        action: 'farm.update',
        entityType: 'Farm',
        entityId: id,
        before: auditView(before),
        after: auditView(row),
      });
      return toDto(row);
    });
  }

  /** Деактивация хозяйства: его активное наличие → `PAUSED (FARM_INACTIVE)` (SPEC 8.2, D-51). */
  private async pauseActiveListings(
    tx: TransactionClient,
    orgId: string,
    farmId: string,
    actorUserId: string,
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string; reservedKg: string }[]>`
      SELECT id, "reservedKg"::text AS "reservedKg" FROM "Listing"
      WHERE "farmId" = ${farmId}::uuid AND status = 'ACTIVE'
      ORDER BY id FOR UPDATE`;
    for (const l of rows) {
      const next = nextListingState({ status: 'ACTIVE', pauseReason: null }, 'FARM_DEACTIVATED', {
        reservedKg: l.reservedKg,
      });
      await tx.listing.update({
        where: { id: l.id },
        data: { status: next.status, pauseReason: next.pauseReason },
      });
      await recordEvent(tx, 'listing.status_changed', l.id, {
        listingId: l.id,
        orgId,
        from: 'ACTIVE',
        to: next.status,
        pauseReason: next.pauseReason,
        actorUserId,
      });
    }
    return rows.map((r) => r.id);
  }

  private async findOwn(
    tx: TransactionClient | PrismaService['client'],
    orgId: string,
    id: string,
  ): Promise<Row> {
    const farm = await tx.farm.findFirst({ where: { id, sellerOrgId: orgId }, include: INCLUDE });
    if (!farm) throw new DomainError(ErrorCode.NOT_FOUND, 'Farm not found');
    return farm;
  }

  private async assertRegion(regionId: number): Promise<void> {
    const region = await this.prisma.client.region.findUnique({ where: { id: regionId } });
    if (!region) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Unknown region', {
        fields: [{ field: 'regionId', constraints: ['exists'] }],
      });
    }
  }
}

/** В аудит — поля хозяйства без вложенных объектов файлов. */
function auditView(f: Row) {
  const { media, _count, region, ...rest } = f;
  return { ...rest, regionCode: region.code, mediaIds: media.map((m) => m.id) };
}
