/**
 * Календарь Asia/Tashkent (SPEC 5.2, 12.1): UTC+5 круглый год, перехода на летнее время нет,
 * поэтому дата и время суток считаются сдвигом без `Intl` (D-09).
 */
const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Дата `YYYY-MM-DD` в Ташкенте для момента `at`. */
export function tashkentDate(at: Date): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Минуты от полуночи по Ташкенту. */
export function tashkentMinuteOfDay(at: Date): number {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Сдвиг календарной даты `YYYY-MM-DD` на `days` дней. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Колонка `@db.Date` (полночь UTC) → `YYYY-MM-DD`. */
export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Входит ли момент в рабочие часы `ops.workingHours` (`HH:MM`, по Ташкенту). */
export function isWithinWorkingHours(at: Date, hours: { from: string; to: string }): boolean {
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const m = tashkentMinuteOfDay(at);
  return m >= toMin(hours.from) && m < toMin(hours.to);
}
