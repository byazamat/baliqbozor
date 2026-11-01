import { describe, expect, it } from 'vitest';

import { createApiClient } from './client.js';
import { ApiRequestError, clientError, errorCode, invalidFields, unwrap } from './errors.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('errors', () => {
  it('unwrap returns data or throws ApiRequestError with the API code', async () => {
    const ok = createApiClient({
      baseUrl: 'http://api.test',
      fetch: () => Promise.resolve(json(200, { status: 'ok', service: 'api' })),
    });
    await expect(unwrap(ok.GET('/health'))).resolves.toMatchObject({ status: 'ok' });

    const fail = createApiClient({
      baseUrl: 'http://api.test',
      fetch: () =>
        Promise.resolve(
          json(400, {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'x',
              requestId: 'r',
              details: { fields: [{ field: 'tin' }, { field: 1 }] },
            },
          }),
        ),
    });
    const err = await unwrap(fail.GET('/health')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(errorCode(err)).toBe('VALIDATION_FAILED');
    expect([...invalidFields(err)]).toEqual(['tin']);
  });

  it('maps non-API failures to INTERNAL_ERROR', async () => {
    const garbage = createApiClient({
      baseUrl: 'http://api.test',
      fetch: () => Promise.resolve(json(502, { oops: true })),
    });
    expect(errorCode(await unwrap(garbage.GET('/health')).catch((e: unknown) => e))).toBe(
      'INTERNAL_ERROR',
    );
    const offline = createApiClient({
      baseUrl: 'http://api.test',
      fetch: () => Promise.reject(new TypeError('offline')),
    });
    expect(errorCode(await unwrap(offline.GET('/health')).catch((e: unknown) => e))).toBe(
      'INTERNAL_ERROR',
    );
    expect(errorCode(new Error('x'))).toBe('INTERNAL_ERROR');
    expect(invalidFields(clientError('NOT_FOUND')).size).toBe(0);
  });
});
