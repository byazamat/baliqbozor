import { DomainError, ErrorCode } from '../errors.js';

export const MediaKind = { IMAGE: 'IMAGE', VIDEO: 'VIDEO', PDF: 'PDF', OTHER: 'OTHER' } as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

/** Назначение загрузки: определяет, к чему привязан файл и кто его видит. M1 — документы верификации. */
export const MediaPurpose = { ORG_VERIFICATION: 'ORG_VERIFICATION' } as const;
export type MediaPurpose = (typeof MediaPurpose)[keyof typeof MediaPurpose];

const MB = 1024 * 1024;

/** Ограничения SPEC 10.3: изображения и PDF до 15 МБ, видео до 60 МБ (длительность — в обработке, M2). */
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
};

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
