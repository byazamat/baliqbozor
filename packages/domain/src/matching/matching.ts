import { Decimal } from 'decimal.js';

import type { ProductForm } from '../enums.js';
import { haversineKm, type LatLng } from '../geo/geo.js';
import { addDays } from '../time/tashkent.js';

/** Сборный заказ допускает хозяйства, закрывающие от 20% объёма (SPEC 8.5). */
export const SPLIT_FACTOR = 0.2;
/** Дней в пути на каждые 400 км (SPEC 8.5). */
export const KM_PER_TRANSIT_DAY = 400;
/** Надёжность продавца без истории (SPEC 8.5). */
export const DEFAULT_RELIABILITY = 60;

export interface MatchingWeights {
  distance: number;
  price: number;
  reliability: number;
  freshness: number;
  volume: number;
}

export interface RequestForMatching {
  speciesId: number;
  /** Подходящие размерные классы: запрошенный и, если можно, соседние ({@link allowedSizeClassIds}). */
  sizeClassIds: readonly number[];
  form: ProductForm;
  volumeKg: Decimal.Value;
  minAcceptableKg: Decimal.Value | null;
  volumeRemaining: Decimal.Value;
  deliveryDateFrom: string;
  deliveryDateTo: string;
  targetPricePerKg: bigint | null;
  radiusKm: number;
  point: LatLng;
}

export interface ListingForMatching {
  listingId: string;
  orgId: string;
  farmId: string;
  speciesId: number;
  sizeClassId: number;
  form: ProductForm;
  availableKg: Decimal.Value;
  minOrderKg: Decimal.Value;
  availableFrom: string;
  availableTo: string | null;
  /** `null` — цена договорная. */
  pricePerKg: bigint | null;
  lastConfirmedAt: Date | null;
  /** 0..100; `null` — истории нет. */
  reliability: number | null;
  point: LatLng;
}

export type MatchMiss = 'SPECIES' | 'SIZE' | 'FORM' | 'VOLUME' | 'WINDOW' | 'DISTANCE';

/**
 * Запрошенный размер и соседние по порядку `sort` (SPEC 8.5). `sizes` — классы вида,
 * отсортированные по `sort`.
 */
export function allowedSizeClassIds(
  sizes: readonly { id: number }[],
  requestedId: number,
  acceptAdjacent: boolean,
): number[] {
  const i = sizes.findIndex((s) => s.id === requestedId);
  if (i < 0) return [requestedId];
  if (!acceptAdjacent) return [requestedId];
  return sizes.slice(Math.max(0, i - 1), i + 2).map((s) => s.id);
}

/** Фильтр кандидатов 8.5: вид, размер, форма, объём, окно вылова с учётом пути, радиус. */
export function matchListing(
  r: RequestForMatching,
  l: ListingForMatching,
): { ok: true; distanceKm: number } | { ok: false; miss: MatchMiss } {
  if (l.speciesId !== r.speciesId) return { ok: false, miss: 'SPECIES' };
  if (!r.sizeClassIds.includes(l.sizeClassId)) return { ok: false, miss: 'SIZE' };
  if (l.form !== r.form) return { ok: false, miss: 'FORM' };
  const available = new Decimal(l.availableKg);
  const need = Decimal.min(new Decimal(r.minAcceptableKg ?? r.volumeKg), new Decimal(r.volumeKg));
  if (available.lt(l.minOrderKg) || available.lt(need.times(SPLIT_FACTOR))) {
    return { ok: false, miss: 'VOLUME' };
  }
  const distanceKm = haversineKm(r.point, l.point);
  if (distanceKm > r.radiusKm) return { ok: false, miss: 'DISTANCE' };
  const transitDays = Math.ceil(distanceKm / KM_PER_TRANSIT_DAY);
  const catchBy = addDays(r.deliveryDateFrom, -transitDays);
  if (l.availableFrom > r.deliveryDateTo || (l.availableTo !== null && l.availableTo < catchBy)) {
    return { ok: false, miss: 'WINDOW' };
  }
  return { ok: true, distanceKm };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const DAY = 24 * 60 * 60 * 1000;

/** Части скоринга 8.5, каждая 0..1. */
export function scoreParts(
  r: RequestForMatching,
  l: ListingForMatching,
  distanceKm: number,
  ctx: { now: Date; freshnessDays: number },
): MatchingWeights {
  let price: number;
  if (l.pricePerKg === null) price = 0.5;
  else if (r.targetPricePerKg === null) price = 0.5;
  else if (l.pricePerKg <= r.targetPricePerKg) price = 1;
  else {
    // Дороже ориентира — балл убывает и становится 0 при превышении на 50%.
    const over = Number(l.pricePerKg - r.targetPricePerKg) / Number(r.targetPricePerKg);
    price = clamp(1 - over * 2);
  }
  const ageDays = l.lastConfirmedAt
    ? (ctx.now.getTime() - l.lastConfirmedAt.getTime()) / DAY
    : Infinity;
  const freshness =
    ageDays <= 2 ? 1 : clamp(1 - (ageDays - 2) / Math.max(ctx.freshnessDays - 2, 1));
  const remaining = new Decimal(r.volumeRemaining);
  const volume = remaining.lte(0) ? 1 : clamp(new Decimal(l.availableKg).div(remaining).toNumber());
  return {
    distance: clamp(1 - distanceKm / r.radiusKm),
    price,
    reliability: clamp((l.reliability ?? DEFAULT_RELIABILITY) / 100),
    freshness,
    volume,
  };
}

export interface ScoredCandidate {
  listingId: string;
  orgId: string;
  farmId: string;
  distanceKm: number;
  score: number;
  availableKg: string;
  pricePerKg: bigint | null;
}

/** Кандидаты, прошедшие фильтр, по убыванию балла (при равенстве — ближе). */
export function rankCandidates(
  r: RequestForMatching,
  listings: readonly ListingForMatching[],
  ctx: { now: Date; freshnessDays: number; weights: MatchingWeights },
): ScoredCandidate[] {
  const w = ctx.weights;
  const out: ScoredCandidate[] = [];
  for (const l of listings) {
    const m = matchListing(r, l);
    if (!m.ok) continue;
    const p = scoreParts(r, l, m.distanceKm, ctx);
    const score =
      w.distance * p.distance +
      w.price * p.price +
      w.reliability * p.reliability +
      w.freshness * p.freshness +
      w.volume * p.volume;
    out.push({
      listingId: l.listingId,
      orgId: l.orgId,
      farmId: l.farmId,
      distanceKm: m.distanceKm,
      score: Math.round(score * 1000) / 1000,
      availableKg: new Decimal(l.availableKg).toFixed(3),
      pricePerKg: l.pricePerKg,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
}

/** Лучшая позиция каждой организации (рассылка — одна на продавца, SPEC 8.5). */
export function bestPerOrg(ranked: readonly ScoredCandidate[]): ScoredCandidate[] {
  const seen = new Set<string>();
  return ranked.filter((c) => (seen.has(c.orgId) ? false : (seen.add(c.orgId), true)));
}

export interface SplitLine {
  listingId: string;
  orgId: string;
  farmId: string;
  volumeKg: string;
}

/**
 * Подсказка сборного заказа (SPEC 8.5): жадно по убыванию балла до покрытия остатка,
 * не больше `maxLines` хозяйств. Ничего не создаёт — только предложение.
 */
export function suggestSplit(
  volumeRemaining: Decimal.Value,
  ranked: readonly ScoredCandidate[],
  maxLines: number,
): { lines: SplitLine[]; coveredKg: string; complete: boolean } {
  let left = new Decimal(volumeRemaining);
  const lines: SplitLine[] = [];
  const farms = new Set<string>();
  for (const c of ranked) {
    if (left.lte(0) || lines.length >= maxLines) break;
    if (farms.has(c.farmId)) continue;
    const take = Decimal.min(left, c.availableKg);
    if (take.lte(0)) continue;
    farms.add(c.farmId);
    lines.push({
      listingId: c.listingId,
      orgId: c.orgId,
      farmId: c.farmId,
      volumeKg: take.toFixed(3),
    });
    left = left.minus(take);
  }
  const covered = new Decimal(volumeRemaining).minus(Decimal.max(left, 0));
  return { lines, coveredKg: covered.toFixed(3), complete: left.lte(0) };
}
