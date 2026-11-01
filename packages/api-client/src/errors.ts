import { type ApiErrorResponse, type ErrorCode, isApiError } from './client.js';

type ApiErrorBody = ApiErrorResponse['error'];

/** Ошибка запроса к API с телом единого формата (SPEC 10.2); текст для людей — по `code`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: Pick<ApiErrorBody, 'code' | 'message' | 'details'>,
  ) {
    super(body.message);
    this.name = 'ApiRequestError';
  }

  get code(): ErrorCode {
    return this.body.code;
  }
}

/** Ошибка, сформированная на клиенте до запроса (например, проверка файла). */
export const clientError = (code: ErrorCode, details?: Record<string, unknown>) =>
  new ApiRequestError(0, { code, message: code, ...(details ? { details } : {}) });

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Результат openapi-fetch → данные или `ApiRequestError` (сеть недоступна — `INTERNAL_ERROR`). */
export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await promise;
  } catch {
    throw clientError('INTERNAL_ERROR');
  }
  if (result.response.ok) return result.data as T;
  const body = isApiError(result.error)
    ? result.error.error
    : { code: 'INTERNAL_ERROR' as const, message: 'Unexpected response' };
  throw new ApiRequestError(result.response.status, body);
}

export function errorCode(error: unknown): ErrorCode {
  return error instanceof ApiRequestError ? error.code : 'INTERNAL_ERROR';
}

/** Поля с ошибкой проверки (`VALIDATION_FAILED` → `details.fields[].field`). */
export function invalidFields(error: unknown): Set<string> {
  if (!(error instanceof ApiRequestError) || error.code !== 'VALIDATION_FAILED') return new Set();
  const fields = (error.body.details as { fields?: { field?: unknown }[] } | undefined)?.fields;
  return new Set(
    (fields ?? []).map((f) => f.field).filter((f): f is string => typeof f === 'string'),
  );
}
