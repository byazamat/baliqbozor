import { Decimal } from 'decimal.js';

import type { Locale } from './locales.js';

/**
 * Форматтеры без `Intl` (DECISIONS D-09): одинаковый вывод на Node, в браузере и на Hermes.
 * Форматы — SPEC 12.1. Разделитель тысяч и пробел перед единицей — неразрывный (D-19).
 */
export const NBSP = ' ';

const CURRENCY: Record<Locale, string> = { uz: "so'm", ru: 'сум' };
const KG: Record<Locale, string> = { uz: 'kg', ru: 'кг' };
const DECIMAL_SEPARATOR = ',';
/** Ташкент — UTC+5 круглый год, переходов на летнее время нет с 1992 года. */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function formatInteger(value: bigint): string {
  const negative = value < 0n;
  const grouped = groupThousands((negative ? -value : value).toString());
  return negative ? `-${grouped}` : grouped;
}

function toBigInt(value: bigint | string): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

/** `1 250 000 so'm` / `1 250 000 сум`. Принимает BigInt или строку API. */
export function formatMoney(value: bigint | string, locale: Locale): string {
  return `${formatInteger(toBigInt(value))}${NBSP}${CURRENCY[locale]}`;
}

/** Цена за килограмм: `28 000 so'm/kg` / `28 000 сум/кг`. */
export function formatPricePerKg(value: bigint | string, locale: Locale): string {
  return `${formatMoney(value, locale)}/${KG[locale]}`;
}

/**
 * Вес: `1 250,5 kg` — не больше одного знака после запятой, округление «половина вверх»,
 * нулевая дробная часть не показывается (`1 250 kg`).
 */
export function formatKg(value: string | number | { toString(): string }, locale: Locale): string {
  const rounded = new Decimal(typeof value === 'object' ? value.toString() : value).toDecimalPlaces(
    1,
    Decimal.ROUND_HALF_UP,
  );
  const [intPart = '0', fraction] = rounded.abs().toFixed(1).split('.');
  const sign = rounded.isNegative() && !rounded.isZero() ? '-' : '';
  const tail = fraction && fraction !== '0' ? `${DECIMAL_SEPARATOR}${fraction}` : '';
  return `${sign}${groupThousands(intPart)}${tail}${NBSP}${KG[locale]}`;
}

const pad = (n: number): string => n.toString().padStart(2, '0');

function tashkentParts(date: Date): { y: number; m: number; d: number; hh: number; mm: number } {
  const local = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth() + 1,
    d: local.getUTCDate(),
    hh: local.getUTCHours(),
    mm: local.getUTCMinutes(),
  };
}

/**
 * Дата `05.11.2026`. Строка `YYYY-MM-DD` — это уже локальная дата Ташкента (тип `date` в БД);
 * `Date` и ISO-строки с временем переводятся в Asia/Tashkent.
 */
export function formatDate(value: Date | string): string {
  if (typeof value === 'string') {
    const match = ISO_DATE.exec(value);
    if (match) return `${match[3]}.${match[2]}.${match[1]}`;
  }
  const { y, m, d } = tashkentParts(typeof value === 'string' ? new Date(value) : value);
  return `${pad(d)}.${pad(m)}.${y}`;
}

/** Время в 24-часовом формате по Ташкенту: `14:05`. */
export function formatTime(value: Date | string): string {
  const { hh, mm } = tashkentParts(typeof value === 'string' ? new Date(value) : value);
  return `${pad(hh)}:${pad(mm)}`;
}

/** `05.11.2026 14:05` по Ташкенту. */
export function formatDateTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** Телефон Узбекистана `+998901234567` → `+998 90 123 45 67`; иные номера — без изменений. */
export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 12 || !digits.startsWith('998')) return value;
  return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
}
