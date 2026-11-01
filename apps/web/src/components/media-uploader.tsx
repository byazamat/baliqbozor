'use client';

import { Alert, Button, FileUpload } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { type MediaInfo, useMediaUrl } from '@/lib/listings';
import { uploadSellerMedia } from '@/lib/upload';

/**
 * Фото и видео хозяйства или наличия: загрузка (сжатие фото на клиенте), ожидание проверки
 * в worker, порядок — первое фото становится обложкой (D-52).
 */
export function MediaUploader({
  orgId,
  purpose,
  value,
  onChange,
  disabled,
  label,
  hint,
}: {
  orgId: string;
  purpose: 'FARM_PHOTO' | 'LISTING_MEDIA';
  value: MediaInfo[];
  onChange: (media: MediaInfo[]) => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  const t = useTranslations('web.media');
  const errorText = useErrorText();
  const api = useApi();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]) => {
    setError(null);
    let next = value;
    for (const file of files) {
      setUploading(file.name);
      try {
        const media = await uploadSellerMedia(api, orgId, file, purpose);
        next = [...next, media];
        onChange(next);
      } catch (err) {
        setError(t('uploadFailed', { name: file.name, reason: errorText(err) }));
      }
    }
    setUploading(null);
  };

  return (
    <div className="flex flex-col gap-3" data-testid={`media-${purpose}`}>
      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {value.map((m, i) => (
            <MediaTile
              key={m.id}
              media={m}
              cover={i === 0 && m.kind === 'IMAGE'}
              disabled={disabled}
              onStatus={(updated) =>
                onChange(value.map((v) => (v.id === updated.id ? updated : v)))
              }
              onRemove={() => onChange(value.filter((v) => v.id !== m.id))}
            />
          ))}
        </ul>
      )}
      {!disabled && (
        <FileUpload
          label={label}
          buttonLabel={purpose === 'FARM_PHOTO' ? t('add') : t('addMedia')}
          accept={
            purpose === 'FARM_PHOTO'
              ? 'image/jpeg,image/png,image/webp,image/heic'
              : 'image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime'
          }
          multiple
          hint={hint ?? t('hint')}
          onFiles={(files) => void onFiles(files)}
        />
      )}
      {uploading && (
        <p className="text-ink-muted" aria-live="polite">
          {t('uploading', { name: uploading })}
        </p>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

function MediaTile({
  media,
  cover,
  disabled,
  onStatus,
  onRemove,
}: {
  media: MediaInfo;
  cover: boolean;
  disabled?: boolean;
  onStatus: (media: MediaInfo) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('web.media');
  const api = useApi();
  const waiting = media.status === 'UPLOADED' || media.status === 'PENDING_UPLOAD';
  // Пока worker проверяет файл, опрашиваем его статус (D-52).
  useQuery({
    queryKey: ['media', media.id, 'status'],
    enabled: waiting,
    refetchInterval: 1500,
    queryFn: async () => {
      const fresh = await unwrap(
        api.GET('/api/v1/media/{id}', { params: { path: { id: media.id } } }),
      );
      if (fresh.status !== media.status) onStatus(fresh);
      return fresh;
    },
  });
  const thumb = useMediaUrl(media.hasThumbnail ? media.id : null);
  const rejected = media.status === 'REJECTED';

  return (
    <li
      className="flex flex-col gap-1 rounded-control border border-border bg-surface p-2"
      data-testid="media-tile"
      data-status={media.status}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-surface-muted text-center text-sm text-ink-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- подписанная ссылка на 10 минут, оптимизация Next не нужна
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : rejected ? (
          t('rejected')
        ) : waiting ? (
          t('processing')
        ) : media.kind === 'VIDEO' ? (
          '▶'
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1 text-sm">
        <span className={rejected ? 'text-danger-700' : 'text-ink-muted'}>
          {rejected && media.rejectReason
            ? t(`reject.${media.rejectReason as 'UNREADABLE'}`)
            : cover
              ? t('cover')
              : media.kind === 'VIDEO'
                ? '▶'
                : ''}
        </span>
        {!disabled && (
          <Button
            variant="ghost"
            onClick={onRemove}
            aria-label={t('remove')}
            className="min-h-9 px-2"
          >
            ✕
          </Button>
        )}
      </div>
    </li>
  );
}
