/**
 * Коды ошибок API (SPEC 10.2). Тексты для пользователя — в i18n по ключу `errors.<CODE>`.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  INSUFFICIENT_VOLUME: 'INSUFFICIENT_VOLUME',
  ORG_NOT_VERIFIED: 'ORG_NOT_VERIFIED',
  ORG_SUSPENDED: 'ORG_SUSPENDED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  RATE_LIMITED: 'RATE_LIMITED',
  COMMISSION_OVERDUE_BLOCK: 'COMMISSION_OVERDUE_BLOCK',
  MEDIA_TOO_LARGE: 'MEDIA_TOO_LARGE',
  MEDIA_TYPE_NOT_ALLOWED: 'MEDIA_TYPE_NOT_ALLOWED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_CODES: readonly ErrorCode[] = Object.values(ErrorCode);

/** HTTP-статус по умолчанию для каждого кода. */
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  INSUFFICIENT_VOLUME: 409,
  ORG_NOT_VERIFIED: 403,
  ORG_SUSPENDED: 403,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  OTP_TOO_MANY_ATTEMPTS: 429,
  RATE_LIMITED: 429,
  COMMISSION_OVERDUE_BLOCK: 403,
  MEDIA_TOO_LARGE: 413,
  MEDIA_TYPE_NOT_ALLOWED: 415,
  INTERNAL_ERROR: 500,
};

export type ErrorDetails = Readonly<Record<string, unknown>>;

/** Тело ошибки API (SPEC 10.2). */
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
    requestId: string;
  };
}

/** Ошибка бизнес-правила; API превращает её в {@link ApiError}. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails | undefined;

  constructor(code: ErrorCode, message: string = code, details?: ErrorDetails) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code];
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
