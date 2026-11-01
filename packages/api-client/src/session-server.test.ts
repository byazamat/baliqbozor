import { describe, expect, it, vi } from 'vitest';

import { createSessionHandlers, readCookie } from './session-server.js';

const APP = 'http://app.test';
const PAIR = { accessToken: 'acc', refreshToken: 'ref/1', accessTokenExpiresIn: 900 };

function apiReturning(status: number, body: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

function handlers(fetchMock: typeof fetch, secure = false) {
  return createSessionHandlers({
    apiUrl: 'http://api.test/',
    cookieName: 'bb_rt',
    secure,
    maxAgeDays: 30,
    fetch: fetchMock,
  });
}

const post = (path: string, init: RequestInit = {}) =>
  new Request(`${APP}${path}`, { method: 'POST', ...init });

function apiCall(fetchMock: ReturnType<typeof apiReturning>) {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('API was not called');
  const [url, init] = call;
  return { url: url as string, init: init ?? {} };
}

describe('readCookie', () => {
  it('finds and decodes the named cookie', () => {
    expect(readCookie('a=1; bb_rt=x%2Fy; c', 'bb_rt')).toBe('x/y');
    expect(readCookie('a=1', 'bb_rt')).toBeNull();
    expect(readCookie(null, 'bb_rt')).toBeNull();
  });
});

describe('session handlers', () => {
  it('login: forwards to otp/verify, keeps refresh token in httpOnly cookie only', async () => {
    const api = apiReturning(200, { ...PAIR, user: { id: 'u1' }, isNewUser: true });
    const res = await handlers(api).login(
      post('/api/session/login', {
        body: JSON.stringify({ phone: '+998901234567', code: '000000' }),
        headers: { 'Accept-Language': 'ru', 'User-Agent': 'UA', Origin: APP },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      accessToken: 'acc',
      accessTokenExpiresIn: 900,
      user: { id: 'u1' },
      isNewUser: true,
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('bb_rt=ref%2F1');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/session');
    expect(cookie).toContain(`Max-Age=${String(30 * 86_400)}`);
    expect(cookie).not.toContain('Secure');

    const { url, init } = apiCall(api);
    expect(url).toBe('http://api.test/api/v1/auth/otp/verify');
    const headers = new Headers(init.headers);
    expect(headers.get('accept-language')).toBe('ru');
    expect(headers.get('user-agent')).toBe('UA');
  });

  it('login: passes API errors through without a cookie', async () => {
    const error = { error: { code: 'OTP_INVALID', message: 'bad' } };
    const res = await handlers(apiReturning(400, error)).login(
      post('/api/session/login', { body: '{}' }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(error);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects cross-origin requests', async () => {
    const api = apiReturning(200, PAIR);
    const h = handlers(api);
    const init = { headers: { Origin: 'http://evil.test', Cookie: 'bb_rt=r' } };
    const responses = await Promise.all([
      h.login(post('/api/session/x', init)),
      h.refresh(post('/api/session/x', init)),
      h.logout(post('/api/session/x', init)),
    ]);
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(api).not.toHaveBeenCalled();
  });

  it('refresh: 401 without cookie', async () => {
    const api = apiReturning(200, PAIR);
    const res = await handlers(api).refresh(post('/api/session/refresh'));
    expect(res.status).toBe(401);
    expect(api).not.toHaveBeenCalled();
  });

  it('refresh: rotates cookie and returns only the access token', async () => {
    const api = apiReturning(200, { ...PAIR, refreshToken: 'next' });
    const res = await handlers(api, true).refresh(
      post('/api/session/refresh', { headers: { Cookie: 'bb_rt=old' } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accessToken: 'acc', accessTokenExpiresIn: 900 });
    expect(res.headers.get('set-cookie')).toContain('bb_rt=next');
    expect(res.headers.get('set-cookie')).toContain('Secure');
    expect(JSON.parse(apiCall(api).init.body as string)).toEqual({ refreshToken: 'old' });
  });

  it('refresh: clears cookie when API rejects the token', async () => {
    const res = await handlers(
      apiReturning(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }),
    ).refresh(post('/api/session/refresh', { headers: { Cookie: 'bb_rt=old' } }));
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('refresh: keeps cookie on other API errors and reports 502 when API is down', async () => {
    const h500 = await handlers(
      apiReturning(500, { error: { code: 'INTERNAL_ERROR', message: 'x' } }),
    ).refresh(post('/api/session/refresh', { headers: { Cookie: 'bb_rt=old' } }));
    expect(h500.status).toBe(500);
    expect(h500.headers.get('set-cookie')).toBeNull();

    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    const res = await handlers(down).refresh(
      post('/api/session/refresh', { headers: { Cookie: 'bb_rt=old' } }),
    );
    expect(res.status).toBe(502);
    const login = await handlers(down).login(post('/api/session/login', { body: '{}' }));
    expect(login.status).toBe(502);
  });

  it('logout: revokes the API session and clears cookie even if API fails', async () => {
    const api = apiReturning(204, null);
    const res = await handlers(api).logout(
      post('/api/session/logout', { headers: { Authorization: 'Bearer acc' } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    const { url, init } = apiCall(api);
    expect(url).toBe('http://api.test/api/v1/auth/logout');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer acc');

    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    const offline = await handlers(down).logout(
      post('/api/session/logout', { headers: { Authorization: 'Bearer acc' } }),
    );
    expect(offline.status).toBe(204);

    const anonymous = apiReturning(204, null);
    await handlers(anonymous).logout(post('/api/session/logout'));
    expect(anonymous).not.toHaveBeenCalled();
  });
});
