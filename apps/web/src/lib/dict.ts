'use client';

import type { components } from '@baliqbozor/api-client';
import type { SelectOption } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { useApi } from './api';
import { unwrap } from './errors';

export type Region = components['schemas']['RegionRefDto'];

/** Справочник регионов; названия — из полей `nameUz/nameRu` (SPEC 12.5). */
export function useRegionOptions(): SelectOption[] {
  const api = useApi();
  const locale = useLocale();
  const { data } = useQuery({
    queryKey: ['dict', 'regions'],
    queryFn: () => unwrap(api.GET('/api/v1/dict/regions')),
    staleTime: 60 * 60_000,
  });
  return (data ?? []).map((r) => ({
    value: String(r.id),
    label: locale === 'ru' ? r.nameRu : r.nameUz,
  }));
}

export const regionName = (region: Region | null, locale: string) =>
  region ? (locale === 'ru' ? region.nameRu : region.nameUz) : null;
