import type { ListingStatus } from '../enums.js';
import { isWithinWorkingHours, tashkentDate } from '../time/tashkent.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Срок подтверждения актуальности: `lastConfirmedAt + listing.freshnessDays` (SPEC 8.3). */
export function freshnessDueAt(lastConfirmedAt: Date, freshnessDays: number): Date {
  return new Date(lastConfirmedAt.getTime() + freshnessDays * DAY_MS);
}

/** Границы `lastConfirmedAt` для выборки кандидатов планировщиком. */
export function freshnessCutoffs(now: Date, freshnessDays: number) {
  return {
    /** Подтверждено раньше — пора напоминать (за сутки до срока). */
    remindIfConfirmedBefore: new Date(now.getTime() - (freshnessDays - 1) * DAY_MS),
    /** Подтверждено раньше — срок истёк, автопауза. */
    pauseIfConfirmedBefore: new Date(now.getTime() - freshnessDays * DAY_MS),
  };
}

export type FreshnessDecision = 'EXPIRE' | 'AUTOPAUSE' | 'REMIND' | null;

export interface FreshnessInput {
  status: ListingStatus;
  lastConfirmedAt: Date | null;
  freshnessRemindedAt: Date | null;
  /** `YYYY-MM-DD` или `null` — «до отмены». */
  availableTo: string | null;
}

/**
 * Что планировщик делает с позицией сейчас (D-51): истечение по дате важнее свежести;
 * напоминание — один раз за цикл подтверждения и только в рабочие часы.
 */
export function freshnessDecision(
  l: FreshnessInput,
  now: Date,
  settings: { freshnessDays: number; workingHours: { from: string; to: string } },
): FreshnessDecision {
  const live = l.status === 'ACTIVE' || l.status === 'PAUSED' || l.status === 'SOLD_OUT';
  if (live && l.availableTo !== null && l.availableTo < tashkentDate(now)) return 'EXPIRE';
  if (l.status !== 'ACTIVE' || !l.lastConfirmedAt) return null;
  const due = freshnessDueAt(l.lastConfirmedAt, settings.freshnessDays);
  if (now >= due) return 'AUTOPAUSE';
  const remindedThisCycle =
    l.freshnessRemindedAt !== null && l.freshnessRemindedAt >= l.lastConfirmedAt;
  if (
    now.getTime() >= due.getTime() - DAY_MS &&
    !remindedThisCycle &&
    isWithinWorkingHours(now, settings.workingHours)
  ) {
    return 'REMIND';
  }
  return null;
}
