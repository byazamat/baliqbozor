import { DomainError, ErrorCode } from '../errors.js';

/** Политика OTP (SPEC 13.2, настройки `otp.*` из 8.13 и D-39). */
export interface OtpPolicy {
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  maxPerPhonePerHour: number;
  maxPerIpPerHour: number;
  blockMinutes: number;
}

export const OTP_LENGTH = 6;

/** Код из 6 цифр; источник случайности передаёт вызывающий (crypto.randomInt в api). */
export function generateOtpCode(randomInt: (maxExclusive: number) => number): string {
  let code = '';
  for (let i = 0; i < OTP_LENGTH; i += 1) code += String(randomInt(10));
  return code;
}

export interface OtpRequestState {
  now: Date;
  /** Когда отправлен последний код на этот номер. */
  lastSentAt: Date | null;
  /** Сколько кодов ушло на номер за последний час. */
  sentToPhoneLastHour: number;
  /** Сколько кодов запрошено с IP за последний час. */
  sentFromIpLastHour: number;
  /** До какого момента номер заблокирован. */
  blockedUntil: Date | null;
}

export type OtpRequestDecision =
  | { allowed: true; expiresAt: Date; resendAfterSec: number }
  | {
      allowed: false;
      reason: 'BLOCKED' | 'COOLDOWN' | 'PHONE_LIMIT' | 'IP_LIMIT';
      retryAfterSec: number;
      /** Если задано — заблокировать номер до этого момента. */
      blockUntil?: Date;
    };

const secondsBetween = (from: Date, to: Date): number =>
  Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 1000));

/** Можно ли отправить новый код (лимиты 13.2: кулдаун, номер/час, IP/час, блокировка на час). */
export function decideOtpRequest(state: OtpRequestState, policy: OtpPolicy): OtpRequestDecision {
  const { now } = state;
  if (state.blockedUntil && state.blockedUntil > now) {
    return {
      allowed: false,
      reason: 'BLOCKED',
      retryAfterSec: secondsBetween(now, state.blockedUntil),
    };
  }
  if (state.sentFromIpLastHour >= policy.maxPerIpPerHour) {
    return { allowed: false, reason: 'IP_LIMIT', retryAfterSec: 3600 };
  }
  if (state.sentToPhoneLastHour >= policy.maxPerPhonePerHour) {
    const blockUntil = new Date(now.getTime() + policy.blockMinutes * 60_000);
    return {
      allowed: false,
      reason: 'PHONE_LIMIT',
      retryAfterSec: policy.blockMinutes * 60,
      blockUntil,
    };
  }
  if (state.lastSentAt) {
    const nextAllowed = new Date(state.lastSentAt.getTime() + policy.resendCooldownSeconds * 1000);
    if (nextAllowed > now) {
      return {
        allowed: false,
        reason: 'COOLDOWN',
        retryAfterSec: secondsBetween(now, nextAllowed),
      };
    }
  }
  return {
    allowed: true,
    expiresAt: new Date(now.getTime() + policy.ttlSeconds * 1000),
    resendAfterSec: policy.resendCooldownSeconds,
  };
}

export interface StoredOtp {
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

export type OtpCheck =
  | { ok: true }
  | { ok: false; code: ErrorCode; /** Увеличить счётчик попыток. */ countAttempt: boolean };

/**
 * Проверка введённого кода. `codeMatches` — результат сравнения хэша (делает api).
 * Использованный или просроченный код — `OTP_EXPIRED`; исчерпаны попытки — `OTP_TOO_MANY_ATTEMPTS`.
 */
export function checkOtp(
  otp: StoredOtp | null,
  codeMatches: boolean,
  now: Date,
  policy: Pick<OtpPolicy, 'maxAttempts'>,
): OtpCheck {
  if (!otp || otp.consumedAt || otp.expiresAt <= now) {
    return { ok: false, code: ErrorCode.OTP_EXPIRED, countAttempt: false };
  }
  if (otp.attempts >= policy.maxAttempts) {
    return { ok: false, code: ErrorCode.OTP_TOO_MANY_ATTEMPTS, countAttempt: false };
  }
  if (!codeMatches) {
    const last = otp.attempts + 1 >= policy.maxAttempts;
    return {
      ok: false,
      code: last ? ErrorCode.OTP_TOO_MANY_ATTEMPTS : ErrorCode.OTP_INVALID,
      countAttempt: true,
    };
  }
  return { ok: true };
}

/** Бросает `DomainError` для отказа в отправке кода (`RATE_LIMITED` с `retryAfterSec`). */
export function assertOtpRequestAllowed(
  decision: OtpRequestDecision,
): asserts decision is Extract<OtpRequestDecision, { allowed: true }> {
  if (!decision.allowed) {
    throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many code requests', {
      reason: decision.reason,
      retryAfterSec: decision.retryAfterSec,
    });
  }
}
