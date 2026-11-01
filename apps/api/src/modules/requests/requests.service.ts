import { type Prisma, type TransactionClient } from '@baliqbozor/db';
import {
  assertValidRequestTerms,
  dateOnly,
  DomainError,
  ErrorCode,
  nextRequestStatus,
  type RequestTerms,
  requestExpiresAt,
  tashkentDate,
  volumeRemaining,
  weightToString,
} from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import { afterCursor, DEFAULT_PAGE_SIZE, PAGE_ORDER, toPage } from '../../common/pagination.js';
import type { AuthContext } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { recordEvent } from '../../infra/events.js';
import { PrismaService } from '../../infra/prisma.service.js';
import {
  assertCanInOrg,
  assertCanOnPlatform,
  assertOrgStatusAllows,
  requireOrg,
} from '../auth/policy.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  AdminRequestsQueryDto,
  CreateRequestDto,
  MyRequestsQueryDto,
  RequestDto,
  RequestPageDto,
  UpdateRequestDto,
} from './requests.dto.js';

type Db = TransactionClient | PrismaService['client'];

const REGION = { select: { id: true, code: true, nameUz: true, nameRu: true } } as const;
export const REQUEST_INCLUDE = {
  buyer: { select: { name: true } },
  species: { select: { id: true, code: true, nameUz: true, nameRu: true } },
  sizeClass: { select: { id: true, code: true, labelUz: true, labelRu: true } },
  deliveryAddress: {
    select: { id: true, label: true, addressText: true, lat: true, lng: true, region: REGION },
  },
  _count: { select: { offers: { where: { status: 'PENDING' } } } },
} as const satisfies Prisma.BuyerRequestInclude;
export type RequestRow = Prisma.BuyerRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

const field = (name: string, constraint: string) =>
  new DomainError(ErrorCode.VALIDATION_FAILED, `Invalid ${name}`, {
    fields: [{ field: name, constraints: [constraint] }],
  });

const REQUEST_FIELDS = [
  'speciesId',
  'sizeClassId',
  'acceptAdjacentSizes',
  'form',
  'volumeKg',
  'minAcceptableKg',
  'deliveryAddressId',
  'deliveryDateFrom',
  'deliveryDateTo',
  'targetPricePerKg',
  'radiusKm',
  'isRecurringInterest',
  'notes',
] as const;

/** Остаток заявки: объём минус активные строки заказов (SPEC 8.4). */
export async function remainingKg(db: Db, r: { id: string; volumeKg: { toString(): string } }) {
  const lines = await db.orderLine.findMany({
    where: { order: { requestId: r.id }, status: { notIn: ['DECLINED', 'CANCELLED'] } },
    select: { plannedKg: true },
  });
  return volumeRemaining(
    r.volumeKg.toString(),
    lines.map((l) => l.plannedKg.toString()),
  );
}

export async function toRequestDto(db: Db, r: RequestRow): Promise<RequestDto> {
  return {
    id: r.id,
    number: r.number,
    buyerOrgId: r.buyerOrgId,
    buyerName: r.buyer.name,
    status: r.status,
    species: r.species,
    sizeClass: r.sizeClass,
    acceptAdjacentSizes: r.acceptAdjacentSizes,
    form: r.form,
    volumeKg: weightToString(r.volumeKg),
    minAcceptableKg: r.minAcceptableKg ? weightToString(r.minAcceptableKg) : null,
    volumeRemaining: weightToString(await remainingKg(db, r)),
    deliveryAddress: {
      id: r.deliveryAddress.id,
      label: r.deliveryAddress.label,
      addressText: r.deliveryAddress.addressText,
      region: r.deliveryAddress.region,
      lat: r.deliveryAddress.lat.toFixed(6),
      lng: r.deliveryAddress.lng.toFixed(6),
    },
    deliveryDateFrom: dateOnly(r.deliveryDateFrom),
    deliveryDateTo: dateOnly(r.deliveryDateTo),
    targetPricePerKg: r.targetPricePerKg?.toString() ?? null,
    radiusKm: r.radiusKm,
    isRecurringInterest: r.isRecurringInterest,
    notes: r.notes,
    reviewNote: r.reviewNote,
    pendingOffers: r._count.offers,
    expiresAt: r.expiresAt,
    submittedAt: r.submittedAt,
    openedAt: r.openedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Заявки покупателя (SPEC 8.4, 10.3; D-58): черновик, отправка, модерация первой, отмена. */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async listMine(auth: AuthContext, q: MyRequestsQueryDto): Promise<RequestPageDto> {
    assertCanInOrg(auth, 'REQUESTS_VIEW');
    return this.page({ buyerOrgId: requireOrg(auth).id }, q);
  }

  async listForReview(auth: AuthContext, q: AdminRequestsQueryDto): Promise<RequestPageDto> {
    assertCanOnPlatform(auth, 'REQUEST_REVIEW');
    return this.page({ status: q.status ?? 'PENDING_REVIEW' }, { ...q, status: undefined });
  }

  async getMine(auth: AuthContext, id: string): Promise<RequestDto> {
    assertCanInOrg(auth, 'REQUESTS_VIEW');
    const db = this.prisma.client;
    return toRequestDto(db, await this.findOwn(db, requireOrg(auth).id, id));
  }

  async getForStaff(auth: AuthContext, id: string): Promise<RequestDto> {
    assertCanOnPlatform(auth, 'REQUEST_REVIEW');
    const db = this.prisma.client;
    const row = await db.buyerRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Request not found');
    return toRequestDto(db, row);
  }

  async create(auth: AuthContext, dto: CreateRequestDto): Promise<RequestDto> {
    assertCanInOrg(auth, 'REQUESTS_MANAGE');
    assertOrgStatusAllows(auth, 'CREATE_REQUEST');
    const orgId = requireOrg(auth).id;
    const s = await this.settings.all();
    const today = tashkentDate(new Date());
    const terms = this.terms(dto, null, s['request.defaultRadiusKm']);
    assertValidRequestTerms(terms, { today, minOrderKg: s['order.minOrderKg'] });
    return this.prisma.client.$transaction(async (tx) => {
      await this.assertSizeClass(tx, dto.speciesId, dto.sizeClassId);
      await this.assertAddress(tx, orgId, dto.deliveryAddressId);
      const number = await nextNumber(tx, `RQ-${today.slice(0, 4)}`);
      const created = await tx.buyerRequest.create({
        data: {
          number,
          buyerOrgId: orgId,
          createdById: auth.userId,
          speciesId: dto.speciesId,
          sizeClassId: dto.sizeClassId,
          acceptAdjacentSizes: dto.acceptAdjacentSizes ?? false,
          form: dto.form,
          ...this.termsData(terms),
          deliveryAddressId: dto.deliveryAddressId,
          isRecurringInterest: dto.isRecurringInterest ?? false,
          notes: dto.notes?.trim() || null,
          // Срок пересчитывается при отправке; для черновика — как если бы отправили сейчас.
          expiresAt: requestExpiresAt(
            new Date(),
            terms.deliveryDateFrom,
            s['request.defaultExpiryDays'],
          ),
        },
      });
      const row = await this.findOwn(tx, orgId, created.id);
      await recordEvent(tx, 'request.created', row.id, {
        requestId: row.id,
        orgId,
        actorUserId: auth.userId,
      });
      await this.audit.record(tx, {
        action: 'request.create',
        entityType: 'BuyerRequest',
        entityId: row.id,
        after: auditView(row),
      });
      return toRequestDto(tx, row);
    });
  }

  async update(auth: AuthContext, id: string, dto: UpdateRequestDto): Promise<RequestDto> {
    assertCanInOrg(auth, 'REQUESTS_MANAGE');
    assertOrgStatusAllows(auth, 'CREATE_REQUEST');
    const orgId = requireOrg(auth).id;
    const s = await this.settings.all();
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.lockOwn(tx, orgId, id);
      if (before.status !== 'DRAFT') {
        throw new DomainError(ErrorCode.INVALID_TRANSITION, 'Only drafts can be edited', {
          from: before.status,
        });
      }
      const terms = this.terms(dto, before, s['request.defaultRadiusKm']);
      assertValidRequestTerms(terms, {
        today: tashkentDate(new Date()),
        minOrderKg: s['order.minOrderKg'],
      });
      if (dto.speciesId !== undefined || dto.sizeClassId !== undefined) {
        await this.assertSizeClass(
          tx,
          dto.speciesId ?? before.speciesId,
          dto.sizeClassId ?? before.sizeClassId,
        );
      }
      if (dto.deliveryAddressId !== undefined)
        await this.assertAddress(tx, orgId, dto.deliveryAddressId);
      await tx.buyerRequest.update({
        where: { id },
        data: {
          ...(dto.speciesId !== undefined ? { speciesId: dto.speciesId } : {}),
          ...(dto.sizeClassId !== undefined ? { sizeClassId: dto.sizeClassId } : {}),
          ...(dto.acceptAdjacentSizes !== undefined
            ? { acceptAdjacentSizes: dto.acceptAdjacentSizes }
            : {}),
          ...(dto.form !== undefined ? { form: dto.form } : {}),
          ...(dto.deliveryAddressId !== undefined
            ? { deliveryAddressId: dto.deliveryAddressId }
            : {}),
          ...(dto.isRecurringInterest !== undefined
            ? { isRecurringInterest: dto.isRecurringInterest }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          ...this.termsData(terms),
        },
      });
      const row = await this.findOwn(tx, orgId, id);
      const fields = REQUEST_FIELDS.filter((f) => dto[f] !== undefined);
      if (fields.length > 0) {
        await recordEvent(tx, 'request.updated', id, {
          requestId: id,
          orgId,
          fields: [...fields],
          actorUserId: auth.userId,
        });
      }
      await this.audit.record(tx, {
        action: 'request.update',
        entityType: 'BuyerRequest',
        entityId: id,
        before: auditView(before),
        after: auditView(row),
      });
      return toRequestDto(tx, row);
    });
  }

  /**
   * Отправка (SPEC 8.4, 8.1 п. 6): первая заявка непроверенного покупателя — на модерацию
   * (`PENDING_REVIEW` + задача оператору), остальные — сразу `OPEN`.
   */
  async submit(auth: AuthContext, id: string): Promise<RequestDto> {
    assertCanInOrg(auth, 'REQUESTS_MANAGE');
    assertOrgStatusAllows(auth, 'CREATE_REQUEST');
    const org = requireOrg(auth);
    const s = await this.settings.all();
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.lockOwn(tx, org.id, id);
      assertValidRequestTerms(this.terms({}, before, s['request.defaultRadiusKm']), {
        today: tashkentDate(new Date()),
        minOrderKg: s['order.minOrderKg'],
      });
      const opened = await tx.buyerRequest.count({
        where: { buyerOrgId: org.id, openedAt: { not: null } },
      });
      const needsReview = org.verificationStatus !== 'VERIFIED' && opened === 0;
      const status = nextRequestStatus(before.status, 'SUBMIT', { needsReview });
      const now = new Date();
      await tx.buyerRequest.update({
        where: { id },
        data: {
          status,
          submittedAt: now,
          expiresAt: requestExpiresAt(
            now,
            dateOnly(before.deliveryDateFrom),
            s['request.defaultExpiryDays'],
          ),
          ...(status === 'OPEN' ? { openedAt: now } : {}),
        },
      });
      let taskId: string | undefined;
      if (status === 'PENDING_REVIEW') {
        const task = await tx.opsTask.create({
          data: {
            type: 'REVIEW_REQUEST',
            title: `Review first request ${before.number}`,
            orgId: org.id,
            requestId: id,
          },
        });
        taskId = task.id;
        await recordEvent(tx, 'ops.task.created', task.id, {
          taskId: task.id,
          type: task.type,
          orgId: org.id,
        });
      }
      await recordEvent(tx, 'request.submitted', id, {
        requestId: id,
        orgId: org.id,
        status,
        ...(taskId ? { taskId } : {}),
      });
      if (status === 'OPEN')
        await recordEvent(tx, 'request.opened', id, { requestId: id, orgId: org.id });
      const row = await this.findOwn(tx, org.id, id);
      await this.audit.record(tx, {
        action: 'request.submit',
        entityType: 'BuyerRequest',
        entityId: id,
        before: { status: before.status },
        after: { status, taskId: taskId ?? null },
      });
      return toRequestDto(tx, row);
    });
  }

  /** Решение оператора по первой заявке (D-58): одобрение открывает, отказ отменяет с причиной. */
  async review(
    auth: AuthContext,
    id: string,
    action: 'APPROVE' | 'REJECT',
    note?: string,
  ): Promise<RequestDto> {
    assertCanOnPlatform(auth, 'REQUEST_REVIEW');
    if (action === 'REJECT' && !note?.trim()) throw field('note', 'required');
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "BuyerRequest" WHERE id = ${id}::uuid FOR UPDATE`;
      const before = await tx.buyerRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE });
      if (!before) throw new DomainError(ErrorCode.NOT_FOUND, 'Request not found');
      const status = nextRequestStatus(before.status, action);
      const now = new Date();
      await tx.buyerRequest.update({
        where: { id },
        data: {
          status,
          reviewedAt: now,
          reviewedById: auth.userId,
          reviewNote: action === 'REJECT' ? (note?.trim() ?? null) : null,
          ...(status === 'OPEN' ? { openedAt: now } : {}),
        },
      });
      await tx.opsTask.updateMany({
        where: { requestId: id, type: 'REVIEW_REQUEST', status: 'OPEN' },
        data: { status: 'DONE' },
      });
      const orgId = before.buyerOrgId;
      if (action === 'APPROVE') {
        await recordEvent(tx, 'request.approved', id, {
          requestId: id,
          orgId,
          operatorId: auth.userId,
        });
        await recordEvent(tx, 'request.opened', id, { requestId: id, orgId });
      } else {
        await recordEvent(tx, 'request.rejected', id, {
          requestId: id,
          orgId,
          operatorId: auth.userId,
          note: note?.trim() ?? '',
        });
      }
      await this.audit.record(tx, {
        action: `request.${action.toLowerCase()}`,
        entityType: 'BuyerRequest',
        entityId: id,
        before: { status: before.status },
        after: { status, note: note ?? null },
      });
      const row = await tx.buyerRequest.findUniqueOrThrow({
        where: { id },
        include: REQUEST_INCLUDE,
      });
      return toRequestDto(tx, row);
    });
  }

  /** Отмена покупателем или оператором; ожидающие предложения отклоняются. */
  async cancel(auth: AuthContext, id: string): Promise<RequestDto> {
    assertCanInOrg(auth, 'REQUESTS_MANAGE');
    const orgId = requireOrg(auth).id;
    return this.prisma.client.$transaction(async (tx) => {
      const before = await this.lockOwn(tx, orgId, id);
      const status = nextRequestStatus(before.status, 'CANCEL');
      await tx.buyerRequest.update({ where: { id }, data: { status } });
      await tx.offer.updateMany({
        where: { requestId: id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
      await recordEvent(tx, 'request.cancelled', id, {
        requestId: id,
        orgId,
        actorUserId: auth.userId,
      });
      await this.audit.record(tx, {
        action: 'request.cancel',
        entityType: 'BuyerRequest',
        entityId: id,
        before: { status: before.status },
        after: { status },
      });
      return toRequestDto(tx, await this.findOwn(tx, orgId, id));
    });
  }

  private async page(
    where: Prisma.BuyerRequestWhereInput,
    q: MyRequestsQueryDto,
  ): Promise<RequestPageDto> {
    const limit = q.limit ?? DEFAULT_PAGE_SIZE;
    const db = this.prisma.client;
    const rows = await db.buyerRequest.findMany({
      where: { ...where, ...(q.status ? { status: q.status } : {}), ...afterCursor(q.cursor) },
      include: REQUEST_INCLUDE,
      orderBy: PAGE_ORDER,
      take: limit + 1,
    });
    const page = toPage(rows, limit);
    return {
      items: await Promise.all(page.items.map((r) => toRequestDto(db, r))),
      nextCursor: page.nextCursor,
    };
  }

  private terms(
    dto: UpdateRequestDto,
    before: RequestRow | null,
    defaultRadius: number,
  ): RequestTerms {
    const pick = <T>(v: T | undefined, b: T) => (v !== undefined ? v : b);
    return {
      volumeKg: pick(dto.volumeKg, before?.volumeKg.toString() ?? '0'),
      minAcceptableKg: pick(dto.minAcceptableKg, before?.minAcceptableKg?.toString() ?? null),
      deliveryDateFrom: pick(dto.deliveryDateFrom, before ? dateOnly(before.deliveryDateFrom) : ''),
      deliveryDateTo: pick(dto.deliveryDateTo, before ? dateOnly(before.deliveryDateTo) : ''),
      targetPricePerKg:
        dto.targetPricePerKg !== undefined
          ? dto.targetPricePerKg === null
            ? null
            : BigInt(dto.targetPricePerKg)
          : (before?.targetPricePerKg ?? null),
      radiusKm: pick(dto.radiusKm, before?.radiusKm ?? defaultRadius),
    };
  }

  private termsData(t: RequestTerms) {
    return {
      volumeKg: t.volumeKg.toString(),
      minAcceptableKg: t.minAcceptableKg === null ? null : t.minAcceptableKg.toString(),
      deliveryDateFrom: new Date(t.deliveryDateFrom),
      deliveryDateTo: new Date(t.deliveryDateTo),
      targetPricePerKg: t.targetPricePerKg,
      radiusKm: t.radiusKm,
    };
  }

  private async lockOwn(tx: TransactionClient, orgId: string, id: string): Promise<RequestRow> {
    await tx.$queryRaw`SELECT id FROM "BuyerRequest" WHERE id = ${id}::uuid AND "buyerOrgId" = ${orgId}::uuid FOR UPDATE`;
    return this.findOwn(tx, orgId, id);
  }

  private async findOwn(db: Db, orgId: string, id: string): Promise<RequestRow> {
    const row = await db.buyerRequest.findFirst({
      where: { id, buyerOrgId: orgId },
      include: REQUEST_INCLUDE,
    });
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Request not found');
    return row;
  }

  private async assertSizeClass(tx: TransactionClient, speciesId: number, sizeClassId: number) {
    const size = await tx.sizeClass.findFirst({
      where: { id: sizeClassId, speciesId, isActive: true, species: { isActive: true } },
    });
    if (!size) throw field('sizeClassId', 'matchesSpecies');
  }

  private async assertAddress(tx: TransactionClient, orgId: string, addressId: string) {
    const address = await tx.address.findFirst({
      where: { id: addressId, orgId, isArchived: false },
    });
    if (!address) throw field('deliveryAddressId', 'exists');
  }
}

/** Следующий номер документа `<prefix>-NNNNNN` (D-58). */
export async function nextNumber(tx: TransactionClient, prefix: string): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "NumberSequence" (key, value) VALUES (${prefix}, 1)
    ON CONFLICT (key) DO UPDATE SET value = "NumberSequence".value + 1
    RETURNING value`;
  return `${prefix}-${String(rows[0]?.value ?? 1).padStart(6, '0')}`;
}

function auditView(r: RequestRow): Prisma.InputJsonObject {
  return {
    number: r.number,
    status: r.status,
    speciesId: r.speciesId,
    sizeClassId: r.sizeClassId,
    form: r.form,
    volumeKg: r.volumeKg.toString(),
    minAcceptableKg: r.minAcceptableKg?.toString() ?? null,
    deliveryAddressId: r.deliveryAddressId,
    deliveryDateFrom: dateOnly(r.deliveryDateFrom),
    deliveryDateTo: dateOnly(r.deliveryDateTo),
    targetPricePerKg: r.targetPricePerKg?.toString() ?? null,
    radiusKm: r.radiusKm,
  };
}
