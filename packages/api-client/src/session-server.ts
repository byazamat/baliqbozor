/**
 * Серверная часть сессии web/admin (D-31): refresh-токен живёт только в httpOnly-cookie,
 * браузер получает access-токен в теле ответа. Обработчики работают с Web `Request`/`Response`,
 * поэтому подключаются в route handlers Next.js без зависимости от фреймворка.
 */

export interface SessionServerOptions {
  /** Origin API, например `http://localhost:4000`. */
  apiUrl: string;
  /** Имя cookie: web и admin на одном хосте не должны делить сессию. */
  cookieName: string;
  /** Путь cookie — route handlers сессии, остальным запросам она не нужна. */
  cookiePath?: string;
  /** `Secure` — везде, кроме локальной разработки по http. */
  secure: boolean;
  /** Срок жизни cookie, дни (как `REFRESH_TTL_DAYS` у API). */
  maxAgeDays: number;
  fetch?: typeof globalThis.fetch;
}

export interface SessionHandlers {
  login(request: Request): Promise<Response>;
  refresh(request: Request): Promise<Response>;
  logout(request: Request): Promise<Response>;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function isTokenPair(body: unknown): body is TokenPair {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.accessToken === 'string' &&
    typeof b.refreshToken === 'string' &&
    typeof b.accessTokenExpiresIn === 'number'
  );
}

export function createSessionHandlers(options: SessionServerOptions): SessionHandlers {
  const doFetch = options.fetch ?? globalThis.fetch;
  const apiUrl = options.apiUrl.replace(/\/+$/, '');
  const path = options.cookiePath ?? '/api/session';

  const cookie = (value: string, maxAgeSec: number) =>
    [
      `${options.cookieName}=${encodeURIComponent(value)}`,
      `Path=${path}`,
      `Max-Age=${String(maxAgeSec)}`,
      'HttpOnly',
      'SameSite=Lax',
      ...(options.secure ? ['Secure'] : []),
    ].join('; ');
  const setCookie = (token: string) => cookie(token, options.maxAgeDays * 86_400);
  const clearCookie = () => cookie('', 0);

  /** Запросы только со своего origin: cookie SameSite=Lax плюс явная проверка `Origin`. */
  const crossOrigin = (request: Request) => {
    const origin = request.headers.get('origin');
    return origin !== null && origin !== new URL(request.url).origin;
  };

  /** Заголовки клиента, которые API пишет в сессию и использует для языка сообщений. */
  const forwarded = (request: Request, extra: Record<string, string> = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json', ...extra });
    for (const name of ['accept-language', 'user-agent', 'x-forwarded-for', 'x-request-id']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    return headers;
  };

  const callApi = async (request: Request, apiPath: string, body: unknown) => {
    try {
      const res = await doFetch(`${apiUrl}/api/v1${apiPath}`, {
        method: 'POST',
        headers: forwarded(request),
        body: JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
    } catch {
      return null;
    }
  };

  const unavailable = () => json(errorBody('INTERNAL_ERROR', 'API unavailable'), 502);
  const forbidden = () => json(errorBody('FORBIDDEN', 'Cross-origin request'), 403);

  return {
    async login(request) {
      if (crossOrigin(request)) return forbidden();
      const input = (await request.json().catch(() => null)) as unknown;
      const res = await callApi(request, '/auth/otp/verify', input);
      if (!res) return unavailable();
      if (res.status !== 200 || !isTokenPair(res.body)) return json(res.body, res.status);
      const { refreshToken, ...rest } = res.body as TokenPair & Record<string, unknown>;
      return json(rest, 200, { 'Set-Cookie': setCookie(refreshToken) });
    },

    async refresh(request) {
      if (crossOrigin(request)) return forbidden();
      const token = readCookie(request.headers.get('cookie'), options.cookieName);
      if (!token) return json(errorBody('UNAUTHORIZED', 'No session'), 401);
      const res = await callApi(request, '/auth/refresh', { refreshToken: token });
      if (!res) return unavailable();
      if (res.status !== 200 || !isTokenPair(res.body)) {
        // Отозванная или истёкшая сессия: cookie больше не нужна.
        const headers: HeadersInit = res.status === 401 ? { 'Set-Cookie': clearCookie() } : {};
        return json(res.body, res.status, headers);
      }
      return json(
        { accessToken: res.body.accessToken, accessTokenExpiresIn: res.body.accessTokenExpiresIn },
        200,
        { 'Set-Cookie': setCookie(res.body.refreshToken) },
      );
    },

    async logout(request) {
      if (crossOrigin(request)) return forbidden();
      const authorization = request.headers.get('authorization');
      if (authorization) {
        // Отзыв сессии в API; ошибка не мешает выйти локально.
        await doFetch(`${apiUrl}/api/v1/auth/logout`, {
          method: 'POST',
          headers: forwarded(request, { Authorization: authorization }),
        }).catch(() => undefined);
      }
      return new Response(null, {
        status: 204,
        headers: { 'Set-Cookie': clearCookie(), 'Cache-Control': 'no-store' },
      });
    },
  };
}
