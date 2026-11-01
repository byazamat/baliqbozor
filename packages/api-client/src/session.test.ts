import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionManager } from './session.js';

const jsonRes = (status: number, body: unknown) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const TOKENS = { accessToken: 'a1', accessTokenExpiresIn: 900 };
const LOGIN = { ...TOKENS, user: { id: 'u1' }, isNewUser: false };

/** Маршрутизатор: путь → ответ (функция, чтобы каждый вызов получал свежий Response). */
function routes(table: Record<string, () => Response | Promise<Response>>) {
  return vi.fn<typeof fetch>((input) => {
    const url = input instanceof Request ? input.url : String(input);
    const path = new URL(url, 'http://app.test').pathname;
    const handler = table[path];
    if (!handler) return Promise.reject(new Error(`unexpected ${path}`));
    return Promise.resolve(handler());
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('SessionManager', () => {
  it('init: restores session from cookie and notifies listeners', async () => {
    const fetchMock = routes({ '/api/session/refresh': () => jsonRes(200, TOKENS) });
    const session = new SessionManager({ fetch: fetchMock });
    const states: string[] = [];
    session.subscribe((s) => states.push(s));

    expect(session.getState()).toBe('unknown');
    expect(await session.init()).toBe('authenticated');
    expect(await session.getAccessToken()).toBe('a1');
    expect(states).toEqual(['authenticated']);
    // Повторный init не ходит в сеть.
    await session.init();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('init: anonymous without cookie or when API is unreachable', async () => {
    const noCookie = new SessionManager({
      fetch: routes({ '/api/session/refresh': () => jsonRes(401, null) }),
    });
    expect(await noCookie.init()).toBe('anonymous');
    expect(await noCookie.getAccessToken()).toBeNull();

    const down = new SessionManager({
      fetch: vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
    });
    expect(await down.init()).toBe('anonymous');

    const failing = new SessionManager({
      fetch: routes({ '/api/session/refresh': () => jsonRes(502, null) }),
    });
    expect(await failing.init()).toBe('anonymous');
  });

  it('deduplicates concurrent refreshes', async () => {
    const fetchMock = routes({ '/api/session/refresh': () => jsonRes(200, TOKENS) });
    const session = new SessionManager({ fetch: fetchMock });
    const tokens = await Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    expect(tokens).toEqual(['a1', 'a1', 'a1']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refreshes ahead of expiry', async () => {
    let now = 0;
    let n = 0;
    const fetchMock = routes({
      '/api/session/refresh': () => {
        n += 1;
        return jsonRes(200, { accessToken: `a${String(n)}`, accessTokenExpiresIn: 100 });
      },
    });
    const session = new SessionManager({ fetch: fetchMock, now: () => now, refreshLeewaySec: 10 });
    await session.init();
    now = 80_000;
    expect(await session.getAccessToken()).toBe('a1');
    now = 95_000;
    expect(await session.getAccessToken()).toBe('a2');
  });

  it('uses Web Locks when available', async () => {
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { locks: { request } });
    const session = new SessionManager({
      fetch: routes({ '/api/session/refresh': () => jsonRes(200, TOKENS) }),
      lockName: 'test-lock',
    });
    await session.refresh();
    expect(request).toHaveBeenCalledWith('test-lock', expect.any(Function));
  });

  it('login: success stores token; errors are returned with code', async () => {
    const ok = new SessionManager({
      fetch: routes({ '/api/session/login': () => jsonRes(200, LOGIN) }),
    });
    const res = await ok.login('+998901234567', '000000');
    expect(res).toEqual({ ok: true, data: LOGIN });
    expect(ok.getState()).toBe('authenticated');
    expect(await ok.getAccessToken()).toBe('a1');

    const bad = new SessionManager({
      fetch: routes({
        '/api/session/login': () =>
          jsonRes(400, { error: { code: 'OTP_INVALID', message: 'x', details: { left: 2 } } }),
      }),
    });
    expect(await bad.login('+998901234567', '111111')).toEqual({
      ok: false,
      status: 400,
      error: { code: 'OTP_INVALID', message: 'x', details: { left: 2 } },
    });

    const garbage = new SessionManager({
      fetch: routes({ '/api/session/login': () => new Response('oops', { status: 500 }) }),
    });
    const g = await garbage.login('+998901234567', '111111');
    expect(g.ok === false && g.error.code).toBe('INTERNAL_ERROR');

    const offline = new SessionManager({
      fetch: vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
    });
    expect(await offline.login('+998901234567', '111111')).toMatchObject({ ok: false, status: 0 });
  });

  it('logout: sends bearer token and becomes anonymous even offline', async () => {
    const fetchMock = routes({
      '/api/session/login': () => jsonRes(200, LOGIN),
      '/api/session/logout': () => new Response(null, { status: 204 }),
    });
    const session = new SessionManager({ fetch: fetchMock });
    await session.login('+998901234567', '000000');
    await session.logout();
    const [, init] = fetchMock.mock.calls.at(-1) ?? [];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer a1');
    expect(session.getState()).toBe('anonymous');
    expect(await session.getAccessToken()).toBeNull();

    const offline = new SessionManager({
      fetch: vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
    });
    await offline.logout();
    expect(offline.getState()).toBe('anonymous');
  });

  it('fetch: retries once with a fresh token after 401', async () => {
    let apiCalls = 0;
    const fetchMock = routes({
      '/api/session/refresh': () => jsonRes(200, { ...TOKENS, accessToken: 'fresh' }),
      '/api/v1/me': () => {
        apiCalls += 1;
        return apiCalls === 1 ? jsonRes(401, null) : jsonRes(200, { id: 'u1' });
      },
    });
    const session = new SessionManager({ fetch: fetchMock });
    const res = await session.fetch('http://api.test/api/v1/me', {
      method: 'POST',
      headers: { Authorization: 'Bearer stale' },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(200);
    const retried = fetchMock.mock.calls.at(-1)?.[0] as Request;
    expect(retried.headers.get('Authorization')).toBe('Bearer fresh');
    expect(await retried.text()).toBe('{"a":1}');
  });

  it('fetch: passes through 401 without auth header or when refresh fails', async () => {
    const fetchMock = routes({
      '/api/session/refresh': () => jsonRes(401, null),
      '/api/v1/me': () => jsonRes(401, null),
    });
    const session = new SessionManager({ fetch: fetchMock });
    expect((await session.fetch('http://api.test/api/v1/me')).status).toBe(401);
    const withAuth = await session.fetch('http://api.test/api/v1/me', {
      headers: { Authorization: 'Bearer x' },
    });
    expect(withAuth.status).toBe(401);
    expect(session.getState()).toBe('anonymous');
  });

  it('unsubscribe stops notifications', async () => {
    const session = new SessionManager({
      fetch: routes({ '/api/session/refresh': () => jsonRes(200, TOKENS) }),
    });
    const listener = vi.fn();
    const off = session.subscribe(listener);
    off();
    await session.init();
    expect(listener).not.toHaveBeenCalled();
  });
});
