import { DomainError, ErrorCode } from '../errors.js';
import type { OrgAction } from '../org/access.js';

export const MediaKind = { IMAGE: 'IMAGE', VIDEO: 'VIDEO', PDF: 'PDF', OTHER: 'OTHER' } as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

/** Назначение загрузки: определяет, к чему привязан файл и кто его видит (D-44, D-52). */
export const MediaPurpose = {
  ORG_VERIFICATION: 'ORG_VERIFICATION',
  FARM_PHOTO: 'FARM_PHOTO',
  LISTING_MEDIA: 'LISTING_MEDIA',
} as const;
export type MediaPurpose = (typeof MediaPurpose)[keyof typeof MediaPurpose];

const MB = 1024 * 1024;

/** Ограничения SPEC 10.3: изображения и PDF до 15 МБ, видео до 60 МБ и 60 с (длительность — в worker). */
export const MEDIA_LIMITS: Readonly<
  Record<Exclude<MediaKind, 'OTHER'>, { mimeTypes: readonly string[]; maxBytes: number }>
> = {
  IMAGE: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxBytes: 15 * MB },
  VIDEO: { mimeTypes: ['video/mp4', 'video/quicktime'], maxBytes: 60 * MB },
  PDF: { mimeTypes: ['application/pdf'], maxBytes: 15 * MB },
};

/** Какие виды файлов допустимы для назначения (D-44). */
export const PURPOSE_KINDS: Readonly<Record<MediaPurpose, readonly MediaKind[]>> = {
  ORG_VERIFICATION: ['IMAGE', 'PDF'],
  FARM_PHOTO: ['IMAGE'],
  LISTING_MEDIA: ['IMAGE', 'VIDEO'],
};

/** Право в организации, нужное для загрузки файла с этим назначением. */
export const PURPOSE_UPLOAD_ACTION = {
  ORG_VERIFICATION: 'ORG_SUBMIT_VERIFICATION',
  FARM_PHOTO: 'FARMS_MANAGE',
  LISTING_MEDIA: 'LISTINGS_MANAGE',
} as const satisfies Record<MediaPurpose, OrgAction>;

/** Максимальная длительность видео контрольного облова, с (SPEC 10.3). */
export const MAX_VIDEO_DURATION_SEC = 60;

/** Проверка заявленной загрузки до выдачи presigned URL. */
export function assertMediaUploadAllowed(input: {
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  purpose: MediaPurpose;
}): void {
  if (input.kind === 'OTHER' || !PURPOSE_KINDS[input.purpose].includes(input.kind)) {
    throw new DomainError(
      ErrorCode.MEDIA_TYPE_NOT_ALLOWED,
      'File kind not allowed for this purpose',
      {
        kind: input.kind,
        purpose: input.purpose,
      },
    );
  }
  const limits = MEDIA_LIMITS[input.kind];
  if (!limits.mimeTypes.includes(input.mimeType.toLowerCase())) {
    throw new DomainError(ErrorCode.MEDIA_TYPE_NOT_ALLOWED, 'MIME type not allowed', {
      mimeType: input.mimeType,
      allowed: [...limits.mimeTypes],
    });
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid size', {
      fields: [{ field: 'sizeBytes', constraints: ['positiveInt'] }],
    });
  }
  if (input.sizeBytes > limits.maxBytes) {
    throw new DomainError(ErrorCode.MEDIA_TOO_LARGE, 'File too large', {
      maxBytes: limits.maxBytes,
    });
  }
}

/** Подтверждение загрузки: объект на месте и его размер совпадает с заявленным. */
export function uploadedObjectIssue(
  declaredBytes: number,
  object: { sizeBytes: number } | null,
): 'NOT_UPLOADED' | 'SIZE_MISMATCH' | null {
  if (!object) return 'NOT_UPLOADED';
  return object.sizeBytes === declaredBytes ? null : 'SIZE_MISMATCH';
}

/** MIME, определённые по содержимому, которые принимаются для каждого вида (HEIF — вариант HEIC). */
const DETECTED_MIME: Readonly<Record<string, Exclude<MediaKind, 'OTHER'>>> = {
  'image/jpeg': 'IMAGE',
  'image/png': 'IMAGE',
  'image/webp': 'IMAGE',
  'image/heic': 'IMAGE',
  'image/heif': 'IMAGE',
  'video/mp4': 'VIDEO',
  'video/quicktime': 'VIDEO',
  'application/pdf': 'PDF',
};

export type MediaRejectReason = 'UNKNOWN_TYPE' | 'TYPE_MISMATCH' | 'VIDEO_TOO_LONG' | 'UNREADABLE';

/**
 * Сверка содержимого (magic bytes) с заявленным видом (SPEC 13.2, D-52). Возвращает настоящий
 * MIME — заявленный клиентом мог отличаться в пределах вида (png вместо jpeg).
 */
export function classifyDetectedMedia(
  declared: MediaKind,
  detectedMime: string | undefined,
): { ok: true; mimeType: string } | { ok: false; reason: MediaRejectReason } {
  const kind = detectedMime ? DETECTED_MIME[detectedMime] : undefined;
  if (!kind || !detectedMime) return { ok: false, reason: 'UNKNOWN_TYPE' };
  if (kind !== declared) return { ok: false, reason: 'TYPE_MISMATCH' };
  return { ok: true, mimeType: detectedMime === 'image/heif' ? 'image/heic' : detectedMime };
}

/** Видео длиннее 60 с отклоняется; доля секунды на округление контейнера допускается. */
export function isVideoDurationAllowed(durationSec: number): boolean {
  return durationSec <= MAX_VIDEO_DURATION_SEC + 0.5;
}
