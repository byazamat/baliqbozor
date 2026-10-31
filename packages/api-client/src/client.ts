import createClient, { type Client, type Middleware } from 'openapi-fetch';

import type { components, paths } from './generated/schema.js';

export type ApiClient = Client<paths>;
export type ApiErrorBody = components['schemas']['ApiErrorBodyDto'];
export type ApiErrorResponse = components['schemas']['ApiErrorDto'];
export type ErrorCode = components['schemas']['ErrorCode'];

type Getter = () => string | null | undefined | Promise<string | null | undefined>;

export interface ApiClientOptions {
  /** Origin API, например `http://localhost:4000` (пути в схеме уже содержат `/api/v1`). */
  baseUrl: string;
  /** Access-токен для `Authorization: Bearer …`. */
  getAccessToken?: Getter;
  /** Текущая организация для заголовка `X-Org-Id`. */
  getOrgId?: Getter;
  /** Язык сообщений API (`Accept-Language`): `uz` или `ru`. */
  getLocale?: Getter;
  fetch?: typeof globalThis.fetch;
}

async function setHeader(
  headers: Headers,
  name: string,
  getter: Getter | undefined,
): Promise<void> {
  if (!getter || headers.has(name)) return;
  const value = await getter();
  if (value) headers.set(name, value);
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  const contextHeaders: Middleware = {
    async onRequest({ request }) {
      const token = options.getAccessToken ? await options.getAccessToken() : undefined;
      if (token && !request.headers.has('Authorization')) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
      await setHeader(request.headers, 'X-Org-Id', options.getOrgId);
      await setHeader(request.headers, 'Accept-Language', options.getLocale);
      return request;
    },
  };
  client.use(contextHeaders);
  return client;
}

/** Проверка тела ответа на единый формат ошибки API (SPEC 10.2). */
export function isApiError(body: unknown): body is ApiErrorResponse {
  if (typeof body !== 'object' || body === null || !('error' in body)) return false;
  const { error } = body;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
