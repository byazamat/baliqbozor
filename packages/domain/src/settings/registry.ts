import { z } from 'zod';

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const bps = int(0, 10_000);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Настройки платформы (SPEC 8.13 + D-35, D-39): схема значения, значение по умолчанию.
 * Хранятся в `Setting`, кэшируются в Redis, меняются администратором с аудитом.
 */
export const SETTINGS = {
  'commission.defaultRateBps': { schema: bps, default: 200 },
  'commission.billingPeriod': { schema: z.enum(['WEEK', 'MONTH']), default: 'WEEK' },
  'commission.paymentDueDays': { schema: int(1, 90), default: 7 },
  'commission.blockAfterOverdueDays': { schema: int(1, 365), default: 14 },
  'order.minOrderKg': { schema: int(1, 100_000), default: 100 },
  'order.sellerConfirmationTimeoutHours': { schema: int(1, 168), default: 6 },
  'order.acceptanceTimeoutHours': { schema: int(1, 168), default: 24 },
  'order.weightToleranceBps': { schema: bps, default: 1000 },
  'order.deadFishPolicy': { schema: z.enum(['NOT_PAID', 'PAID']), default: 'NOT_PAID' },
  'order.requireVetDocument': { schema: z.boolean(), default: false },
  'listing.freshnessDays': { schema: int(1, 60), default: 7 },
  'listing.nowMaxDaysAhead': { schema: int(0, 60), default: 7 },
  'request.defaultExpiryDays': { schema: int(1, 60), default: 5 },
  'request.defaultRadiusKm': { schema: int(1, 2000), default: 150 },
  'offer.defaultValidityHours': { schema: int(1, 720), default: 24 },
  'matching.maxNotify': { schema: int(1, 500), default: 20 },
  'matching.maxLinesPerOrder': { schema: int(1, 20), default: 4 },
  'matching.weights': {
    schema: z
      .object({
        distance: z.number().min(0).max(1),
        price: z.number().min(0).max(1),
        reliability: z.number().min(0).max(1),
        freshness: z.number().min(0).max(1),
        volume: z.number().min(0).max(1),
      })
      .strict()
      .refine(
        (w) => Math.abs(w.distance + w.price + w.reliability + w.freshness + w.volume - 1) < 1e-9,
        { message: 'Weights must sum to 1' },
      ),
    default: { distance: 0.35, price: 0.25, reliability: 0.2, freshness: 0.1, volume: 0.1 },
  },
  'logistics.roadFactor': { schema: z.number().min(1).max(3), default: 1.3 },
  'payment.overdueDays': { schema: int(1, 90), default: 3 },
  'dispute.windowHours': { schema: int(1, 720), default: 48 },
  'review.blindPeriodDays': { schema: int(1, 60), default: 7 },
  'priceIndex.minDeals': { schema: int(1, 100), default: 3 },
  'ops.unmatchedRequestHours': { schema: int(1, 168), default: 4 },
  'ops.workingHours': {
    schema: z
      .object({ from: hhmm, to: hhmm })
      .strict()
      .refine((v) => v.from < v.to, { message: '`from` must be before `to`' }),
    default: { from: '08:00', to: '20:00' },
  },
  'otp.ttlSeconds': { schema: int(60, 3600), default: 300 },
  'otp.maxAttempts': { schema: int(1, 20), default: 5 },
  'otp.resendCooldownSeconds': { schema: int(10, 3600), default: 60 },
  'otp.maxPerPhonePerHour': { schema: int(1, 100), default: 5 },
  'otp.maxPerIpPerHour': { schema: int(1, 1000), default: 20 },
  'otp.blockMinutes': { schema: int(1, 1440), default: 60 },
  'org.invitationTtlDays': { schema: int(1, 365), default: 30 },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown }>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
export type SettingsSnapshot = { [K in SettingKey]: SettingValue<K> };

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}

export type SettingParseResult<K extends SettingKey> =
  { ok: true; value: SettingValue<K> } | { ok: false; issues: string[] };

/** Проверка значения перед сохранением (админка) и при чтении из БД. */
export function parseSetting<K extends SettingKey>(key: K, value: unknown): SettingParseResult<K> {
  const result = SETTINGS[key].schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data as SettingValue<K> };
  return { ok: false, issues: result.error.issues.map((i) => i.message) };
}

/** Значения по умолчанию, поверх которых накладываются сохранённые. Неверные сохранённые — игнорируются. */
export function resolveSettings(stored: ReadonlyMap<string, unknown>): {
  values: SettingsSnapshot;
  invalidKeys: SettingKey[];
} {
  const invalidKeys: SettingKey[] = [];
  const entries = SETTING_KEYS.map((key) => {
    if (!stored.has(key)) return [key, SETTINGS[key].default] as const;
    const parsed = parseSetting(key, stored.get(key));
    if (!parsed.ok) invalidKeys.push(key);
    return [key, parsed.ok ? parsed.value : SETTINGS[key].default] as const;
  });
  return { values: Object.fromEntries(entries) as SettingsSnapshot, invalidKeys };
}

export function defaultSettings(): SettingsSnapshot {
  return resolveSettings(new Map()).values;
}
