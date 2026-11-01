import type { ApiClient, components } from '@baliqbozor/api-client';
import { MEDIA_LIMITS } from '@baliqbozor/domain';

import { clientError, unwrap } from './errors';

export type Media = components['schemas']['MediaDto'];

/** Вид файла документа верификации (D-44: изображения и PDF). */
export function documentKind(file: File): 'IMAGE' | 'PDF' | null {
  const type = file.type.toLowerCase();
  if (MEDIA_LIMITS.PDF.mimeTypes.includes(type)) return 'PDF';
  if (MEDIA_LIMITS.IMAGE.mimeTypes.includes(type)) return 'IMAGE';
  return null;
}

/**
 * Загрузка документа организации: presigned PUT напрямую в хранилище → `complete` (SPEC 10.3).
 * Тип и размер проверяются до запроса теми же лимитами, что и в API.
 */
export async function uploadOrgDocument(
  api: ApiClient,
  orgId: string,
  file: File,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Media> {
  const kind = documentKind(file);
  if (!kind) throw clientError('MEDIA_TYPE_NOT_ALLOWED');
  if (file.size === 0 || file.size > MEDIA_LIMITS[kind].maxBytes)
    throw clientError('MEDIA_TOO_LARGE');

  const upload = await unwrap(
    api.POST('/api/v1/media/upload-url', {
      body: { kind, mimeType: file.type, sizeBytes: file.size, purpose: 'ORG_VERIFICATION' },
      params: { header: { 'X-Org-Id': orgId } },
    }),
  );
  let put: Response;
  try {
    put = await fetchImpl(upload.uploadUrl, { method: 'PUT', headers: upload.headers, body: file });
  } catch {
    throw clientError('INTERNAL_ERROR');
  }
  if (!put.ok) throw clientError('INTERNAL_ERROR');
  return unwrap(
    api.POST('/api/v1/media/{id}/complete', { params: { path: { id: upload.mediaId } } }),
  );
}

/** `1,2 МБ` — одна десятичная, запятая (SPEC 12.1). */
export function formatMegabytes(bytes: number): string {
  const mb = Math.max(0.1, Math.round((bytes / (1024 * 1024)) * 10) / 10);
  return mb.toFixed(1).replace('.', ',').replace(/,0$/, '');
}
