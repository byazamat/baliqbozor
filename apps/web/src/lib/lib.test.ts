import { createApiClient } from '@baliqbozor/api-client';
import { describe, expect, it, vi } from 'vitest';

import { errorCode } from './errors';
import { documentKind, formatMegabytes, uploadOrgDocument } from './upload';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('upload', () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'f', { type });

  it('detects document kind and formats size', () => {
    expect(documentKind(file('application/pdf'))).toBe('PDF');
    expect(documentKind(file('image/heic'))).toBe('IMAGE');
    expect(documentKind(file('video/mp4'))).toBeNull();
    expect(formatMegabytes(1_300_000)).toBe('1,2');
    expect(formatMegabytes(2 * 1024 * 1024)).toBe('2');
    expect(formatMegabytes(10)).toBe('0,1');
  });

  it('requests a presigned URL with X-Org-Id, PUTs the file and completes', async () => {
    const calls: Request[] = [];
    const api = createApiClient({
      baseUrl: 'http://api.test',
      fetch: (input) => {
        const req = input as Request;
        calls.push(req);
        if (req.url.endsWith('/upload-url'))
          return Promise.resolve(
            json(201, {
              mediaId: 'm1',
              uploadUrl: 'http://s3.test/put',
              headers: { 'Content-Type': 'image/png' },
              expiresAt: '',
            }),
          );
        return Promise.resolve(json(200, { id: 'm1', status: 'UPLOADED' }));
      },
    });
    const put = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 200 })));
    const media = await uploadOrgDocument(api, 'org-1', file('image/png'), put);
    expect(media).toMatchObject({ id: 'm1', status: 'UPLOADED' });
    expect(calls[0]?.headers.get('X-Org-Id')).toBe('org-1');
    expect(await calls[0]?.json()).toEqual({
      kind: 'IMAGE',
      mimeType: 'image/png',
      sizeBytes: 10,
      purpose: 'ORG_VERIFICATION',
    });
    expect(put).toHaveBeenCalledWith(
      'http://s3.test/put',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(calls[1]?.url).toBe('http://api.test/api/v1/media/m1/complete');
  });

  it('rejects wrong type, empty or large files before any request, and failed PUTs', async () => {
    const apiFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(json(201, { mediaId: 'm1', uploadUrl: 'http://s3.test/put', headers: {} })),
    );
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: apiFetch });
    const code = (p: Promise<unknown>) => p.catch((e: unknown) => errorCode(e));
    expect(await code(uploadOrgDocument(api, 'o', file('text/plain')))).toBe(
      'MEDIA_TYPE_NOT_ALLOWED',
    );
    expect(await code(uploadOrgDocument(api, 'o', file('image/png', 0)))).toBe('MEDIA_TOO_LARGE');
    expect(apiFetch).not.toHaveBeenCalled();

    const failedPut = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 403 })),
    );
    expect(await code(uploadOrgDocument(api, 'o', file('image/png'), failedPut))).toBe(
      'INTERNAL_ERROR',
    );
    const offline = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline')));
    expect(await code(uploadOrgDocument(api, 'o', file('image/png'), offline))).toBe(
      'INTERNAL_ERROR',
    );
  });
});
