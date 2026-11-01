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

export type MediaPurpose = components['schemas']['UploadUrlRequestDto']['purpose'];

/** Вид фото или видео наличия и хозяйства (D-52). */
export function photoOrVideoKind(file: File): 'IMAGE' | 'VIDEO' | null {
  const type = file.type.toLowerCase();
  if (MEDIA_LIMITS.IMAGE.mimeTypes.includes(type)) return 'IMAGE';
  if (MEDIA_LIMITS.VIDEO.mimeTypes.includes(type)) return 'VIDEO';
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
  return await uploadFile(api, orgId, file, kind, 'ORG_VERIFICATION', fetchImpl);
}

/** Загрузка проверенного файла: upload-url → PUT → complete. */
export async function uploadFile(
  api: ApiClient,
  orgId: string,
  file: Blob,
  kind: 'IMAGE' | 'VIDEO' | 'PDF',
  purpose: MediaPurpose,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Media> {
  if (file.size === 0 || file.size > MEDIA_LIMITS[kind].maxBytes)
    throw clientError('MEDIA_TOO_LARGE');

  const upload = await unwrap(
    api.POST('/api/v1/media/upload-url', {
      body: { kind, mimeType: file.type, sizeBytes: file.size, purpose },
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

/** Цель сжатия фото на клиенте (SPEC 10.3) и длинная сторона, как у обработки в worker (D-52). */
const TARGET_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 2560;

/**
 * Сжатие фото до ~2 МБ в JPEG (SPEC 10.3, D-46 п. 7). HEIC переводится в JPEG, если браузер
 * умеет его декодировать (Safari); иначе — понятная ошибка вместо отказа после загрузки.
 */
export async function compressPhoto(file: File): Promise<Blob> {
  const heic = file.type.toLowerCase() === 'image/heic';
  if (!heic && file.size <= TARGET_BYTES) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (heic) throw clientError('MEDIA_TYPE_NOT_ALLOWED');
    return file;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (blob && (blob.size <= TARGET_BYTES || quality === 0.6)) return blob;
  }
  return file;
}

/** Фото или видео продавца: сжатие фото и загрузка с назначением `FARM_PHOTO`/`LISTING_MEDIA`. */
export async function uploadSellerMedia(
  api: ApiClient,
  orgId: string,
  file: File,
  purpose: 'FARM_PHOTO' | 'LISTING_MEDIA',
): Promise<Media> {
  const kind = photoOrVideoKind(file);
  if (!kind || (kind === 'VIDEO' && purpose === 'FARM_PHOTO')) {
    throw clientError('MEDIA_TYPE_NOT_ALLOWED');
  }
  const body = kind === 'IMAGE' ? await compressPhoto(file) : file;
  return await uploadFile(api, orgId, body, kind, purpose);
}
