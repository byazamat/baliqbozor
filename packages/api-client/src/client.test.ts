import { describe, expect, it, vi } from 'vitest';

import { createApiClient, isApiError } from './client.js';

function mockFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>((input) => {
    void input;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

function lastRequest(fetchMock: ReturnType<typeof mockFetch>): Request {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch was not called');
  const [input] = call;
  if (!(input instanceof Request)) throw new Error('expected Request');
  return input;
}

describe('createApiClient', () => {
  it('calls /health and returns typed data', async () => {
    const fetchMock = mockFetch(200, { status: 'ok', service: 'api' });
    const api = createApiClient({ baseUrl: 'http://api.test/', fetch: fetchMock });

    const { data, error } = await api.GET('/health');

    expect(error).toBeUndefined();
    expect(data?.status).toBe('ok');
    expect(lastRequest(fetchMock).url).toBe('http://api.test/health');
  });

  it('sets auth, org and locale headers from getters', async () => {
    const fetchMock = mockFetch(200, { status: 'ok', service: 'api' });
    const api = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetchMock,
      getAccessToken: () => 'tok',
      getOrgId: () => Promise.resolve('org-1'),
      getLocale: () => 'ru',
    });

    await api.GET('/health');

    const headers = lastRequest(fetchMock).headers;
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('X-Org-Id')).toBe('org-1');
    expect(headers.get('Accept-Language')).toBe('ru');
  });

  it('skips empty values and keeps explicit headers', async () => {
    const fetchMock = mockFetch(200, { status: 'ok', service: 'api' });
    const api = createApiClient({
      baseUrl: 'http://api.test',
      fetch: fetchMock,
      getAccessToken: () => null,
      getOrgId: () => 'org-default',
      getLocale: () => undefined,
    });

    await api.GET('/health', { headers: { 'X-Org-Id': 'org-explicit' } });

    const headers = lastRequest(fetchMock).headers;
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.get('X-Org-Id')).toBe('org-explicit');
    expect(headers.has('Accept-Language')).toBe(false);
  });

  it('returns API error body on failure', async () => {
    const body = { error: { code: 'INTERNAL_ERROR', message: 'x', requestId: 'r' } };
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: mockFetch(503, body) });

    const { error } = await api.GET('/ready');

    expect(isApiError(error)).toBe(true);
  });
});

describe('isApiError', () => {
  it.each([
    [null, false],
    ['x', false],
    [{}, false],
    [{ error: null }, false],
    [{ error: { code: 1, message: 'm' } }, false],
    [{ error: { code: 'X' } }, false],
    [{ error: { code: 'X', message: 'm', requestId: 'r' } }, true],
  ])('%j → %s', (value, expected) => {
    expect(isApiError(value)).toBe(expected);
  });
});
