import { type Prisma, type TransactionClient } from '@baliqbozor/db';
import {
  assertPublishable,
  assertValidListingTerms,
  availableKg,
  dateOnly,
  Decimal,
  DomainError,
  ErrorCode,
  isListingEditable,
  type ListingAction,
  type ListingState,
  type ListingTerms,
  nextListingState,
  statusAfterVolumeChange,
  tashkentDate,
} from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import { afterCursor, DEFAULT_PAGE_SIZE, PAGE_ORDER, toPage } from '../../common/pagination.js';
import type { AuthContext } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { recordEvent } from '../../infra/events.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { assertCanInOrg, assertOrgStatusAllows, requireOrg } from '../auth/policy.js';
import { attachMedia } from '../media/media-attach.js';
import { SettingsService } from '../settings/settings.service.js';
import { LISTING_INCLUDE, type ListingRow, toListingDto, volumesOf } from './listing-view.js';
import type {
  ConfirmListingDto,
  CreateListingDto,
  ListingDto,
  ListingPageDto,
  SellerListingsQueryDto,
  UpdateListingDto,
} from './listings.dto.js';

type Db = TransactionClient | PrismaService['client'];

const field = (name: string, constraint: string) =>
  new DomainError(ErrorCode.VALIDATION_FAILED, `Invalid ${name}`, {
    fields: [{ field: name, constraints: [constraint] }],
  });

/** Поля, которые после черновика не меняются: на них ссылаются предложения и заказы (D-51). */
const DRAFT_ONLY = ['farmId', 'speciesId', 'sizeClassId', 'form'] as const;

const LISTING_FIELDS = [
  ...DRAFT_ONLY,
  'kind',
  'volumeKg',
  'minOrderKg',
  'priceType',
  'pricePerKg',
  'availableFrom',
  'availableTo',
  'description',
  'mediaIds',
] as const;

/** Наличие продавца (SPEC 8.3, 10.3; D-15, D-51): черновик, публикация, пауза, архив, свежесть. */
@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(auth: AuthContext, query: SellerListingsQueryDto): Promise<ListingPageDto> {
    assertCanInOrg(auth, 'LISTINGS_VIEW');
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.client.listing.findMany({
      where: {
        sellerOrgId: requireOrg(auth).id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.farmId ? { farmId: query.farmId } : {}),
        ...afterCursor(query.cursor),
      },
      include: LISTING_INCLUDE,
      orderBy: PAGE_ORDER,
      take: limit + 1,
    });
    const days = await this.settings.get('listing.freshnessDays');
    const page = toPage(rows, limit);
    return { items: page.items.map((l) => toListingDto(l, days)), nextCursor: page.nextCursor };
  }

  async get(auth: AuthContext, id: string): Promise<ListingDto> {
    assertCanInOrg(auth, 'LISTINGS_VIEW');
    const row = await this.findOwn(this.prisma.client, requireOrg(auth).id, id);
    return this.view(row);
  }

  async create(auth: AuthContext, dto: CreateListingDto): Promise<ListingDto> {
    assertCanInOrg(auth, 'LISTINGS_MANAGE');
    assertOrgStatusAllows(auth, 'MANAGE_DRAFTS');
    const orgId = requireOrg(auth).id;
    const s = await this.termsSettings();
    const terms: ListingTerms = {
      kind: dto.kind,
      volumeKg: dto.volumeKg,
      minOrderKg: dto.minOrderKg ?? String(s.minOrderKg),
      priceType: dto.priceType,
      pricePerKg: dto.pricePerKg ? BigInt(dto.pricePerKg) : null,
      availableFrom: dto.availableFrom,
      availableTo: dto.availableTo ?? null,
    };
    assertValidListingTerms(terms, { ...s, checkKind: true });
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertFarm(tx, orgId, dto.farmId);
      await this.assertSizeClass(tx, dto.speciesId, dto.sizeClassId);
      const created = await tx.listing.create({
        data: {
          sellerOrgId: orgId,
          farmId: dto.farmId,
          speciesId: dto.speciesId,
          sizeClassId: dto.sizeClassId,
          form: dto.form,
          kind: terms.kind,
          volumeKg: dto.volumeKg,
          minOrderKg: terms.minOrderKg.toString(),
          priceType: terms.priceType,
          pricePerKg: terms.pricePerKg,
          availableFrom: new Date(terms.availableFrom),
          availableTo: terms.availableTo ? new Date(terms.availableTo) : null,
          description: dto.description?.trim() || null,
          createdById: auth.userId,
        },
      });
      if (dto.mediaIds?.length) {
        await attachMedia(tx, {
          orgId,
          purpose: 'LISTING_MEDIA',
          mediaIds: dto.mediaIds,
          target: { listingId: created.id },
        });
      }
      const row = await this.findOwn(tx, orgId, created.id);
      await recordEvent(tx, 'listing.created', row.id, {
        listingId: row.id,
        orgId,
        actorUserId: auth.userId,
      });
      await this.audit.record(tx, {
        action: 'listing.create',
        entityType: 'Listing',
        entityId: row.id,
        after: auditView(row),
      });
      return this.view(row);
    });
  }

  async update(auth: AuthContext, id: string, dto: UpdateListingDto): Promise<ListingDto> {
    assertCanInOrg(auth, 'LISTINGS_MANAGE');
    assertOrgStatusAllows(auth, 'MANAGE_DRAFTS');
    const orgId = requireOrg(auth).id;
    const s = await this.termsSettings();
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.lockOwn(tx, orgId, id);
      if (!isListingEditable(before.status)) {
        throw new DomainError(ErrorCode.INVALID_TRANSITION, 'Archived listing cannot be edited', {
          from: before.status,
        });
      }
      const changedDraftOnly = DRAFT_ONLY.filter(
        (f) => dto[f] !== undefined && dto[f] !== before[f],
      );
      if (before.status !== 'DRAFT' && changedDraftOnly.length > 0) {
        throw field(changedDraftOnly[0] ?? 'farmId', 'draftOnly');
      }
      if (dto.farmId !== undefined && dto.farmId !== before.farmId) {
        await this.assertFarm(tx, orgId, dto.farmId);
      }
      if (dto.speciesId !== undefined || dto.sizeClassId !== undefined) {
        await this.assertSizeClass(
          tx,
          dto.speciesId ?? before.speciesId,
          dto.sizeClassId ?? before.sizeClassId,
        );
      }

      const v = volumesOf(before);
      const priceType = dto.priceType ?? before.priceType;
      const terms: ListingTerms = {
        kind: dto.kind ?? before.kind,
        volumeKg: dto.volumeKg ?? v.volumeKg,
        minOrderKg: dto.minOrderKg ?? before.minOrderKg.toString(),
        priceType,
        pricePerKg:
          dto.pricePerKg !== undefined
            ? dto.pricePerKg === null
              ? null
              : BigInt(dto.pricePerKg)
            : priceType === 'NEGOTIABLE'
              ? null
              : before.pricePerKg,
        availableFrom: dto.availableFrom ?? dateOnly(before.availableFrom),
        availableTo:
          dto.availableTo !== undefined
            ? dto.availableTo
            : before.availableTo
              ? dateOnly(before.availableTo)
              : null,
      };
      assertValidListingTerms(terms, {
        ...s,
        committedKg: new Decimal(v.reservedKg).plus(v.soldKg),
        checkKind: dto.kind !== undefined || dto.availableFrom !== undefined,
      });

      const volumeChanged = !new Decimal(terms.volumeKg).eq(v.volumeKg);
      const priceChanged = terms.pricePerKg !== before.pricePerKg || priceType !== before.priceType;
      const remaining = availableKg({
        volumeKg: terms.volumeKg,
        reservedKg: v.reservedKg,
        soldKg: v.soldKg,
      });
      const status = statusAfterVolumeChange(before.status, remaining);
      const now = new Date();
      await tx.listing.update({
        where: { id },
        data: {
          ...(dto.farmId !== undefined ? { farmId: dto.farmId } : {}),
          ...(dto.speciesId !== undefined ? { speciesId: dto.speciesId } : {}),
          ...(dto.sizeClassId !== undefined ? { sizeClassId: dto.sizeClassId } : {}),
          ...(dto.form !== undefined ? { form: dto.form } : {}),
          kind: terms.kind,
          volumeKg: terms.volumeKg.toString(),
          minOrderKg: terms.minOrderKg.toString(),
          priceType,
          pricePerKg: terms.pricePerKg,
          availableFrom: new Date(terms.availableFrom),
          availableTo: terms.availableTo ? new Date(terms.availableTo) : null,
          ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
          status,
          // Правка объёма или цены — тоже подтверждение актуальности (SPEC 8.3).
          ...((volumeChanged || priceChanged) && before.status !== 'DRAFT'
            ? { lastConfirmedAt: now, freshnessRemindedAt: null }
            : {}),
        },
      });
      if (dto.mediaIds !== undefined) {
        await attachMedia(tx, {
          orgId,
          purpose: 'LISTING_MEDIA',
          mediaIds: dto.mediaIds,
          target: { listingId: id },
        });
      }
      const row = await this.findOwn(tx, orgId, id);
      if (row.status === 'ACTIVE' && processedPhotos(row) === 0)
        throw field('mediaIds', 'photoRequired');

      const fields = LISTING_FIELDS.filter((f) => dto[f] !== undefined);
      if (fields.length > 0) {
        await recordEvent(tx, 'listing.updated', id, {
          listingId: id,
          orgId,
          fields: [...fields],
          actorUserId: auth.userId,
        });
      }
      await this.statusEvent(tx, before, row, auth.userId);
      await this.audit.record(tx, {
        action: 'listing.update',
        entityType: 'Listing',
        entityId: id,
        before: auditView(before),
        after: auditView(row),
      });
      return this.view(row);
    });
  }

  /** `publish` / `resume` / `pause` / `archive` (SPEC 10.3, D-51). */
  async transition(
    auth: AuthContext,
    id: string,
    action: Extract<ListingAction, 'PUBLISH' | 'RESUME' | 'PAUSE' | 'ARCHIVE'>,
  ): Promise<ListingDto> {
    assertCanInOrg(auth, 'LISTINGS_MANAGE');
    const orgId = requireOrg(auth).id;
    const s = await this.termsSettings();
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.lockOwn(tx, orgId, id);
      const next = nextListingState(before, action, { reservedKg: before.reservedKg.toString() });
      const now = new Date();
      if (next.status === 'ACTIVE') await this.assertCanGoLive(tx, auth, before, s.today);
      await tx.listing.update({
        where: { id },
        data: {
          status: next.status,
          pauseReason: next.pauseReason,
          ...(next.status === 'ACTIVE'
            ? {
                lastConfirmedAt: now,
                freshnessRemindedAt: null,
                publishedAt: before.publishedAt ?? now,
              }
            : {}),
        },
      });
      const row = await this.findOwn(tx, orgId, id);
      await this.statusEvent(tx, before, row, auth.userId);
      await this.audit.record(tx, {
        action: `listing.${action.toLowerCase()}`,
        entityType: 'Listing',
        entityId: id,
        before: { status: before.status, pauseReason: before.pauseReason },
        after: { status: row.status, pauseReason: row.pauseReason },
      });
      return this.view(row);
    });
  }

  /**
   * «Актуально» (SPEC 8.3): продлевает свежесть, возвращает автопаузу в `ACTIVE`. Объём и цену
   * меняют только OWNER/MANAGER; STAFF подтверждает как есть (D-15).
   */
  async confirm(auth: AuthContext, id: string, dto: ConfirmListingDto): Promise<ListingDto> {
    const changes = dto.volumeKg !== undefined || dto.pricePerKg !== undefined;
    assertCanInOrg(auth, changes ? 'LISTINGS_MANAGE' : 'LISTING_CONFIRM');
    const orgId = requireOrg(auth).id;
    const s = await this.termsSettings();
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.lockOwn(tx, orgId, id);
      const next = nextListingState(before, 'CONFIRM', {
        reservedKg: before.reservedKg.toString(),
      });
      const v = volumesOf(before);
      const volumeKg = dto.volumeKg ?? v.volumeKg;
      const pricePerKg = dto.pricePerKg !== undefined ? BigInt(dto.pricePerKg) : before.pricePerKg;
      if (changes) {
        assertValidListingTerms(
          {
            kind: before.kind,
            volumeKg,
            minOrderKg: before.minOrderKg.toString(),
            priceType: before.priceType,
            pricePerKg,
            availableFrom: dateOnly(before.availableFrom),
            availableTo: before.availableTo ? dateOnly(before.availableTo) : null,
          },
          {
            ...s,
            committedKg: new Decimal(v.reservedKg).plus(v.soldKg),
            checkKind: false,
          },
        );
      }
      const remaining = availableKg({ volumeKg, reservedKg: v.reservedKg, soldKg: v.soldKg });
      const status = statusAfterVolumeChange(next.status, remaining);
      if (status === 'ACTIVE' && before.status !== 'ACTIVE') {
        await this.assertCanGoLive(tx, auth, before, s.today, remaining.toString());
      }
      await tx.listing.update({
        where: { id },
        data: {
          volumeKg: volumeKg.toString(),
          pricePerKg,
          status,
          pauseReason: next.pauseReason,
          lastConfirmedAt: new Date(),
          freshnessRemindedAt: null,
        },
      });
      const row = await this.findOwn(tx, orgId, id);
      await recordEvent(tx, 'listing.confirmed', id, {
        listingId: id,
        orgId,
        actorUserId: auth.userId,
      });
      await this.statusEvent(tx, before, row, auth.userId);
      await this.audit.record(tx, {
        action: 'listing.confirm',
        entityType: 'Listing',
        entityId: id,
        before: { status: before.status, volumeKg: v.volumeKg, pricePerKg: before.pricePerKg },
        after: {
          status: row.status,
          volumeKg: row.volumeKg.toString(),
          pricePerKg: row.pricePerKg,
        },
      });
      return this.view(row);
    });
  }

  /** Проверки публикации (D-51): верификация, активное хозяйство, обработанное фото, объём, даты. */
  private async assertCanGoLive(
    tx: TransactionClient,
    auth: AuthContext,
    l: ListingRow,
    today: string,
    available?: string,
  ): Promise<void> {
    const org = requireOrg(auth);
    const farm = await tx.$queryRaw<{ isActive: boolean }[]>`
      SELECT "isActive" FROM "Farm" WHERE id = ${l.farmId}::uuid FOR SHARE`;
    const v = volumesOf(l);
    assertPublishable({
      org: { type: org.type, verificationStatus: org.verificationStatus },
      farmActive: farm[0]?.isActive === true,
      processedPhotos: processedPhotos(l),
      availableKg: available ?? v.availableKg,
      availableTo: l.availableTo ? dateOnly(l.availableTo) : null,
      today,
    });
  }

  private async statusEvent(
    tx: TransactionClient,
    before: ListingState & { id: string; sellerOrgId: string },
    after: ListingState,
    actorUserId: string | null,
  ): Promise<void> {
    if (before.status === after.status && before.pauseReason === after.pauseReason) return;
    await recordEvent(tx, 'listing.status_changed', before.id, {
      listingId: before.id,
      orgId: before.sellerOrgId,
      from: before.status,
      to: after.status,
      pauseReason: after.pauseReason,
      actorUserId,
    });
  }

  private async termsSettings() {
    const all = await this.settings.all();
    return {
      today: tashkentDate(new Date()),
      minOrderKg: all['order.minOrderKg'],
      nowMaxDaysAhead: all['listing.nowMaxDaysAhead'],
    };
  }

  private async view(row: ListingRow): Promise<ListingDto> {
    return toListingDto(row, await this.settings.get('listing.freshnessDays'));
  }

  private async lockOwn(tx: TransactionClient, orgId: string, id: string): Promise<ListingRow> {
    await tx.$queryRaw`
      SELECT id FROM "Listing" WHERE id = ${id}::uuid AND "sellerOrgId" = ${orgId}::uuid FOR UPDATE`;
    return this.findOwn(tx, orgId, id);
  }

  private async findOwn(db: Db, orgId: string, id: string): Promise<ListingRow> {
    const row = await db.listing.findFirst({
      where: { id, sellerOrgId: orgId },
      include: LISTING_INCLUDE,
    });
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Listing not found');
    return row;
  }

  private async assertFarm(tx: TransactionClient, orgId: string, farmId: string): Promise<void> {
    const farm = await tx.farm.findFirst({ where: { id: farmId, sellerOrgId: orgId } });
    if (!farm) throw field('farmId', 'exists');
    if (!farm.isActive) throw field('farmId', 'farmActive');
  }

  private async assertSizeClass(tx: TransactionClient, speciesId: number, sizeClassId: number) {
    const size = await tx.sizeClass.findFirst({
      where: { id: sizeClassId, speciesId, isActive: true, species: { isActive: true } },
    });
    if (!size) throw field('sizeClassId', 'matchesSpecies');
  }
}

function processedPhotos(l: { media: { kind: string; status: string }[] }): number {
  return l.media.filter((m) => m.kind === 'IMAGE' && m.status === 'PROCESSED').length;
}

function auditView(l: ListingRow): Prisma.InputJsonObject {
  return {
    farmId: l.farmId,
    speciesId: l.speciesId,
    sizeClassId: l.sizeClassId,
    form: l.form,
    kind: l.kind,
    status: l.status,
    volumeKg: l.volumeKg.toString(),
    minOrderKg: l.minOrderKg.toString(),
    priceType: l.priceType,
    pricePerKg: l.pricePerKg?.toString() ?? null,
    availableFrom: dateOnly(l.availableFrom),
    availableTo: l.availableTo ? dateOnly(l.availableTo) : null,
    mediaIds: l.media.map((m) => m.id),
  };
}
