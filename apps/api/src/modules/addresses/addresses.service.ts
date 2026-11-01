import { type Prisma } from '@baliqbozor/db';
import { DomainError, ErrorCode } from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import { fieldError, optionalPhone } from '../../common/phone.js';
import type { AuthContext } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { assertCanInOrg, requireOrg } from '../auth/policy.js';
import type { AddressDto, CreateAddressDto, UpdateAddressDto } from './addresses.dto.js';

const INCLUDE = {
  region: { select: { id: true, code: true, nameUz: true, nameRu: true } },
} as const;
type Row = Prisma.AddressGetPayload<{ include: typeof INCLUDE }>;

const toDto = (a: Row): AddressDto => ({
  id: a.id,
  label: a.label,
  addressText: a.addressText,
  region: a.region,
  districtName: a.districtName,
  lat: a.lat.toString(),
  lng: a.lng.toString(),
  contactName: a.contactName,
  contactPhone: a.contactPhone,
  workingHours: a.workingHours,
  isDefault: a.isDefault,
  createdAt: a.createdAt,
});

function assertCoords(lat: string | undefined, lng: string | undefined): void {
  if (lat !== undefined && Math.abs(Number(lat)) > 90) throw fieldError('lat', 'range');
  if (lng !== undefined && Math.abs(Number(lng)) > 180) throw fieldError('lng', 'range');
}

/** Адреса доставки покупателя (SPEC 10.3, D-39): архивирование вместо удаления, один адрес по умолчанию. */
@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext): Promise<AddressDto[]> {
    assertCanInOrg(auth, 'ADDRESSES_VIEW');
    const rows = await this.prisma.client.address.findMany({
      where: { orgId: requireOrg(auth).id, isArchived: false },
      include: INCLUDE,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(auth: AuthContext, dto: CreateAddressDto): Promise<AddressDto> {
    assertCanInOrg(auth, 'ADDRESSES_MANAGE');
    const orgId = requireOrg(auth).id;
    assertCoords(dto.lat, dto.lng);
    await this.assertRegion(dto.regionId);
    const contactPhone = optionalPhone(dto.contactPhone, 'contactPhone') ?? null;
    return this.prisma.client.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { orgId, isArchived: false } });
      const isDefault = dto.isDefault === true || count === 0;
      if (isDefault)
        await tx.address.updateMany({
          where: { orgId, isDefault: true },
          data: { isDefault: false },
        });
      const row = await tx.address.create({
        data: {
          orgId,
          label: dto.label.trim(),
          addressText: dto.addressText.trim(),
          regionId: dto.regionId,
          districtName: dto.districtName ?? null,
          lat: dto.lat,
          lng: dto.lng,
          contactName: dto.contactName ?? null,
          contactPhone,
          workingHours: dto.workingHours ?? null,
          isDefault,
        },
        include: INCLUDE,
      });
      await this.audit.record(tx, {
        action: 'address.create',
        entityType: 'Address',
        entityId: row.id,
        after: toDto(row),
      });
      return toDto(row);
    });
  }

  async update(auth: AuthContext, id: string, dto: UpdateAddressDto): Promise<AddressDto> {
    assertCanInOrg(auth, 'ADDRESSES_MANAGE');
    const orgId = requireOrg(auth).id;
    assertCoords(dto.lat, dto.lng);
    await this.assertRegion(dto.regionId);
    const contactPhone = optionalPhone(dto.contactPhone, 'contactPhone');
    return this.prisma.client.$transaction(async (tx) => {
      const current = await this.findOwn(tx, orgId, id);
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { orgId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const row = await tx.address.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.addressText !== undefined ? { addressText: dto.addressText.trim() } : {}),
          ...(dto.regionId !== undefined ? { regionId: dto.regionId } : {}),
          ...(dto.districtName !== undefined ? { districtName: dto.districtName } : {}),
          ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
          ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
          ...(dto.contactName !== undefined ? { contactName: dto.contactName } : {}),
          ...(contactPhone !== undefined ? { contactPhone } : {}),
          ...(dto.workingHours !== undefined ? { workingHours: dto.workingHours } : {}),
          // Снять «по умолчанию» можно только назначив другой адрес.
          ...(dto.isDefault === true ? { isDefault: true } : {}),
        },
        include: INCLUDE,
      });
      await this.audit.record(tx, {
        action: 'address.update',
        entityType: 'Address',
        entityId: id,
        before: toDto(current),
        after: toDto(row),
      });
      return toDto(row);
    });
  }

  /** DELETE = архивирование (SPEC 10.3); адрес по умолчанию переходит к самому старому из оставшихся. */
  async archive(auth: AuthContext, id: string): Promise<void> {
    assertCanInOrg(auth, 'ADDRESSES_MANAGE');
    const orgId = requireOrg(auth).id;
    await this.prisma.client.$transaction(async (tx) => {
      const current = await this.findOwn(tx, orgId, id);
      await tx.address.update({ where: { id }, data: { isArchived: true, isDefault: false } });
      if (current.isDefault) {
        const next = await tx.address.findFirst({
          where: { orgId, isArchived: false },
          orderBy: { createdAt: 'asc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      await this.audit.record(tx, {
        action: 'address.archive',
        entityType: 'Address',
        entityId: id,
      });
    });
  }

  private async findOwn(tx: Prisma.TransactionClient, orgId: string, id: string): Promise<Row> {
    const row = await tx.address.findFirst({
      where: { id, orgId, isArchived: false },
      include: INCLUDE,
    });
    // Чужой адрес неотличим от несуществующего (D-42).
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Address not found');
    return row;
  }

  private async assertRegion(regionId: number | undefined): Promise<void> {
    if (regionId === undefined) return;
    const region = await this.prisma.client.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!region) throw fieldError('regionId', 'exists');
  }
}
