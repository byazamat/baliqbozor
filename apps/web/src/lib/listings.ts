'use client';

import { ApiRequestError, type components } from '@baliqbozor/api-client';
import type { messages } from '@baliqbozor/i18n';
import type { SelectOption } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { useApi } from './api';
import { unwrap, useErrorText } from './errors';

export type Farm = components['schemas']['FarmDto'];
export type Listing = components['schemas']['ListingDto'];
export type ListingStatus = components['schemas']['ListingStatus'];
export type PublicListing = components['schemas']['PublicListingDto'];
export type Species = components['schemas']['SpeciesDto'];
export type MediaInfo = components['schemas']['MediaDto'];

export const farmsQueryKey = (orgId: string) => ['org', orgId, 'farms'] as const;
export const listingsQueryKey = (orgId: string) => ['org', orgId, 'listings'] as const;

const byLocale = (locale: string, uz: string, ru: string) => (locale === 'ru' ? ru : uz);
export const speciesName = (s: { nameUz: string; nameRu: string }, locale: string) =>
  byLocale(locale, s.nameUz, s.nameRu);
export const sizeLabel = (s: { labelUz: string; labelRu: string }, locale: string) =>
  byLocale(locale, s.labelUz, s.labelRu);

/** Справочник видов с размерными классами (SPEC 7.3). */
export function useSpecies(): Species[] {
  const api = useApi();
  const { data } = useQuery({
    queryKey: ['dict', 'species'],
    queryFn: () => unwrap(api.GET('/api/v1/dict/species')),
    staleTime: 60 * 60_000,
  });
  return data ?? [];
}

export function useSpeciesOptions(): { species: Species[]; options: SelectOption[] } {
  const locale = useLocale();
  const species = useSpecies();
  return {
    species,
    options: species.map((s) => ({ value: String(s.id), label: speciesName(s, locale) })),
  };
}

/** Подписанная ссылка на файл или превью; обновляется раньше, чем истечёт (10 мин). */
export function useMediaUrl(mediaId: string | null, variant: 'original' | 'thumb' = 'thumb') {
  const api = useApi();
  const { data } = useQuery({
    queryKey: ['media', mediaId, variant],
    enabled: !!mediaId,
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/media/{id}/url', {
          params: { path: { id: mediaId ?? '' }, query: { variant } },
        }),
      ),
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
  });
  return data?.url ?? null;
}

type IssueKey = keyof (typeof messages)['ru']['web']['listings']['issues'];

/**
 * Текст ошибки с подробностями проверки: `VALIDATION_FAILED` с полями → перечень причин
 * (`web.listings.issues.<constraint>`), иначе — общий текст по коду.
 */
export function useIssueText(): (error: unknown) => string {
  const errorText = useErrorText();
  const t = useTranslations('web.listings.issues');
  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiRequestError && error.code === 'VALIDATION_FAILED') {
        const fields =
          (error.body.details as { fields?: { constraints?: unknown[] }[] } | undefined)?.fields ??
          [];
        const texts = fields
          .flatMap((f) => f.constraints ?? [])
          .filter((c): c is IssueKey => typeof c === 'string' && t.has(c as IssueKey))
          .map((c) => t(c));
        if (texts.length > 0) return [...new Set(texts)].join('. ');
      }
      return errorText(error);
    },
    [errorText, t],
  );
}

/** Объём для поля ввода: `"1500.000"` → `"1500"`, `"12.500"` → `"12.5"`. */
export const trimWeight = (value: string) => value.replace(/\.?0+$/, '');
