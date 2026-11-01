import { Prisma, type TransactionClient } from '@baliqbozor/db';
import {
  allowedSizeClassIds,
  bestPerOrg,
  boundingBox,
  dateOnly,
  DomainError,
  ErrorCode,
  isRequestOpen,
  type ListingForMatching,
  rankCandidates,
  type RequestForMatching,
  type ScoredCandidate,
  suggestSplit,
} from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import { recordEvent } from '../../infra/events.js';
import { SettingsService } from '../settings/settings.service.js';

type Db = TransactionClient;

interface RequestRow {
  id: string;
  speciesId: number;
  sizeClassId: number;
  acceptAdjacentSizes: boolean;
  form: 'LIVE' | 'CHILLED';
  volumeKg: { toString(): string };
  minAcceptableKg: { toString(): string } | null;
  deliveryDateFrom: Date;
  deliveryDateTo: Date;
  targetPricePerKg: bigint | null;
  radiusKm: number;
  deliveryAddress: { lat: { toString(): string }; lng: { toString(): string } };
}

interface CandidateRow {
  listingId: string;
  orgId: string;
  farmId: string;
  sizeClassId: number;
  availableKg: string;
  minOrderKg: string;
  availableFrom: Date;
  availableTo: Date | null;
  pricePerKg: bigint | null;
  lastConfirmedAt: Date | null;
  reliability: string | null;
  lat: string;
  lng: string;
}

/**
 * Подбор (SPEC 8.5, D-58): SQL отбирает активное наличие проверенных продавцов в прямоугольнике
 * вокруг адреса, фильтр и скоринг — правила домена. Рассылка — `RequestNotification` и событие
 * `request.matched` в транзакции открытия заявки; уведомления делает worker.
 */
@Injectable()
export class MatchingService {
  constructor(private readonly settings: SettingsService) {}

  async rank(
    db: Db,
    requestId: string,
    remaining: string,
  ): Promise<{ request: RequestForMatching; ranked: ScoredCandidate[] }> {
    const r = await this.loadRequest(db, requestId);
    const sizes = await db.sizeClass.findMany({
      where: { speciesId: r.speciesId, isActive: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const request: RequestForMatching = {
      speciesId: r.speciesId,
      sizeClassIds: allowedSizeClassIds(sizes, r.sizeClassId, r.acceptAdjacentSizes),
      form: r.form,
      volumeKg: r.volumeKg.toString(),
      minAcceptableKg: r.minAcceptableKg?.toString() ?? null,
      volumeRemaining: remaining,
      deliveryDateFrom: dateOnly(r.deliveryDateFrom),
      deliveryDateTo: dateOnly(r.deliveryDateTo),
      targetPricePerKg: r.targetPricePerKg,
      radiusKm: r.radiusKm,
      point: { lat: Number(r.deliveryAddress.lat), lng: Number(r.deliveryAddress.lng) },
    };
    const listings = await this.candidateListings(db, request);
    const s = await this.settings.all();
    const ranked = rankCandidates(request, listings, {
      now: new Date(),
      freshnessDays: s['listing.freshnessDays'],
      weights: s['matching.weights'],
    });
    return { request, ranked };
  }

  /** Кандидаты и подсказка сборного заказа (SPEC 8.5) для покупателя и оператора. */
  async candidates(db: Db, requestId: string, remaining: string) {
    const { ranked } = await this.rank(db, requestId, remaining);
    const maxLines = await this.settings.get('matching.maxLinesPerOrder');
    return { ranked, split: suggestSplit(remaining, ranked, maxLines) };
  }

  /** При открытии заявки: уведомить лучших продавцов (топ `matching.maxNotify`, по одному разу). */
  async notifyOnOpen(db: Db, requestId: string, remaining: string): Promise<string[]> {
    const { ranked } = await this.rank(db, requestId, remaining);
    const max = await this.settings.get('matching.maxNotify');
    return this.notify(db, requestId, bestPerOrg(ranked), max);
  }

  /**
   * Новое или вернувшееся в продажу наличие (D-58): уведомить продавца по открытым заявкам,
   * которым позиция подходит, если он ещё не уведомлён и лимит рассылки не исчерпан.
   */
  async notifyForListing(db: Db, listingId: string): Promise<void> {
    const listing = await db.listing.findUnique({
      where: { id: listingId },
      select: { speciesId: true, form: true, sellerOrgId: true },
    });
    if (!listing) return;
    const open = await db.buyerRequest.findMany({
      where: {
        status: { in: ['OPEN', 'OFFERS_RECEIVED'] },
        expiresAt: { gt: new Date() },
        speciesId: listing.speciesId,
        form: listing.form,
        notifiedSellers: { none: { sellerOrgId: listing.sellerOrgId } },
      },
      select: { id: true, volumeKg: true },
      take: 200,
    });
    const max = await this.settings.get('matching.maxNotify');
    for (const r of open) {
      const { ranked } = await this.rank(db, r.id, r.volumeKg.toString());
      const mine = ranked.filter((c) => c.listingId === listingId);
      if (mine.length > 0) await this.notify(db, r.id, mine, max);
    }
  }

  /** Приглашение оператором вне топа (SPEC 8.5); лимит рассылки не учитывается (D-58). */
  async invite(db: Db, requestId: string, sellerOrgId: string, operatorId: string): Promise<void> {
    const r = await db.buyerRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    });
    if (!r) throw new DomainError(ErrorCode.NOT_FOUND, 'Request not found');
    if (!isRequestOpen(r.status)) {
      throw new DomainError(ErrorCode.INVALID_TRANSITION, 'Request is not open', {
        from: r.status,
      });
    }
    const seller = await db.organization.findFirst({
      where: { id: sellerOrgId, type: 'SELLER', verificationStatus: 'VERIFIED' },
    });
    if (!seller) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Unknown seller', {
        fields: [{ field: 'sellerOrgId', constraints: ['verifiedSeller'] }],
      });
    }
    const created = await db.requestNotification.createMany({
      data: [{ requestId, sellerOrgId, score: 0, invitedById: operatorId }],
      skipDuplicates: true,
    });
    if (created.count === 0) throw new DomainError(ErrorCode.CONFLICT, 'Seller already notified');
    await recordEvent(db, 'request.matched', requestId, {
      requestId,
      sellerOrgIds: [sellerOrgId],
      invitedById: operatorId,
    });
  }

  private async notify(
    db: Db,
    requestId: string,
    best: ScoredCandidate[],
    max: number,
  ): Promise<string[]> {
    const already = await db.requestNotification.findMany({
      where: { requestId },
      select: { sellerOrgId: true, invitedById: true },
    });
    const notified = new Set(already.map((n) => n.sellerOrgId));
    const used = already.filter((n) => !n.invitedById).length;
    const fresh = best.filter((c) => !notified.has(c.orgId)).slice(0, Math.max(0, max - used));
    if (fresh.length === 0) return [];
    await db.requestNotification.createMany({
      data: fresh.map((c) => ({
        requestId,
        sellerOrgId: c.orgId,
        listingId: c.listingId,
        score: c.score,
      })),
      skipDuplicates: true,
    });
    const sellerOrgIds = fresh.map((c) => c.orgId);
    await recordEvent(db, 'request.matched', requestId, { requestId, sellerOrgIds });
    return sellerOrgIds;
  }

  private async loadRequest(db: Db, id: string): Promise<RequestRow> {
    const r = await db.buyerRequest.findUnique({
      where: { id },
      include: { deliveryAddress: { select: { lat: true, lng: true } } },
    });
    if (!r) throw new DomainError(ErrorCode.NOT_FOUND, 'Request not found');
    return r;
  }

  private async candidateListings(db: Db, r: RequestForMatching): Promise<ListingForMatching[]> {
    const box = boundingBox(r.point, r.radiusKm);
    const rows = await db.$queryRaw<CandidateRow[]>`
      SELECT l.id AS "listingId", l."sellerOrgId" AS "orgId", l."farmId", l."sizeClassId",
        (l."volumeKg" - l."reservedKg" - l."soldKg")::text AS "availableKg",
        l."minOrderKg"::text AS "minOrderKg", l."availableFrom", l."availableTo", l."pricePerKg",
        l."lastConfirmedAt", o."reliabilityScore"::text AS reliability,
        f.lat::text AS lat, f.lng::text AS lng
      FROM "Listing" l
      JOIN "Farm" f ON f.id = l."farmId"
      JOIN "Organization" o ON o.id = l."sellerOrgId"
      WHERE l.status = 'ACTIVE' AND f."isActive" AND o."verificationStatus" = 'VERIFIED'
        AND l."speciesId" = ${r.speciesId}
        AND l."sizeClassId" IN (${Prisma.join([...r.sizeClassIds])})
        AND l.form = ${r.form}::"ProductForm"
        AND l."volumeKg" - l."reservedKg" - l."soldKg" > 0
        AND f.lat BETWEEN ${box.minLat} AND ${box.maxLat}
        AND f.lng BETWEEN ${box.minLng} AND ${box.maxLng}
      LIMIT 2000`;
    return rows.map((c) => ({
      listingId: c.listingId,
      orgId: c.orgId,
      farmId: c.farmId,
      speciesId: r.speciesId,
      sizeClassId: c.sizeClassId,
      form: r.form,
      availableKg: c.availableKg,
      minOrderKg: c.minOrderKg,
      availableFrom: dateOnly(c.availableFrom),
      availableTo: c.availableTo ? dateOnly(c.availableTo) : null,
      pricePerKg: c.pricePerKg,
      lastConfirmedAt: c.lastConfirmedAt,
      reliability: c.reliability === null ? null : Number(c.reliability),
      point: { lat: Number(c.lat), lng: Number(c.lng) },
    }));
  }
}
