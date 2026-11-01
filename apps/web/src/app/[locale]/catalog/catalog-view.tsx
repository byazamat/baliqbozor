'use client';

import type { operations } from '@baliqbozor/api-client';
import { Alert, Button, EmptyState, Input, Select } from '@baliqbozor/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import { PublicListingCard } from '@/components/public-listing';
import { useApi } from '@/lib/api';
import { useRegionOptions } from '@/lib/dict';
import { unwrap, useErrorText } from '@/lib/errors';
import { sizeLabel, useSpeciesOptions } from '@/lib/listings';

type Query = NonNullable<operations['Catalog_search']['parameters']['query']>;

interface Filters {
  speciesId: string;
  sizeClassId: string;
  form: string;
  regionId: string;
  kind: string;
  availableOn: string;
  maxPrice: string;
  radiusKm: string;
  sort: NonNullable<Query['sort']>;
}

const EMPTY: Filters = {
  speciesId: '',
  sizeClassId: '',
  form: '',
  regionId: '',
  kind: '',
  availableOn: '',
  maxPrice: '',
  radiusKm: '300',
  sort: 'score',
};

/** Каталог наличия для всех (SPEC 12.2, D-53): фильтры, «рядом со мной», сортировка, подгрузка. */
export function CatalogView() {
  const t = useTranslations('web.catalog');
  const tl = useTranslations('listing');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorText = useErrorText();
  const api = useApi();
  const regions = useRegionOptions();
  const { species, options: speciesOptions } = useSpeciesOptions();
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [near, setNear] = useState<string | null>(null);
  const [geoError, setGeoError] = useState(false);

  const query: Query = {
    ...(applied.speciesId ? { speciesId: Number(applied.speciesId) } : {}),
    ...(applied.sizeClassId ? { sizeClassId: Number(applied.sizeClassId) } : {}),
    ...(applied.form ? { form: applied.form as Query['form'] } : {}),
    ...(applied.regionId ? { regionId: Number(applied.regionId) } : {}),
    ...(applied.kind ? { kind: applied.kind as Query['kind'] } : {}),
    ...(applied.availableOn ? { availableOn: applied.availableOn } : {}),
    ...(applied.maxPrice.trim() ? { maxPrice: applied.maxPrice.replace(/\D/g, '') } : {}),
    ...(near ? { near, radiusKm: Number(applied.radiusKm) || 300 } : {}),
    sort: applied.sort === 'distance' && !near ? 'score' : applied.sort,
  };
  const { data, error, fetchNextPage, hasNextPage, isFetching, refetch } = useInfiniteQuery({
    queryKey: ['catalog', query],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/listings', {
          params: { query: { ...query, limit: 12, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const sizes = species.find((s) => String(s.id) === draft.speciesId)?.sizeClasses ?? [];
  const set = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));

  const apply = (e: FormEvent) => {
    e.preventDefault();
    setApplied(draft);
  };
  const locate = () => {
    setGeoError(false);
    if (!('geolocation' in navigator)) {
      setGeoError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNear(`${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`);
        setApplied({ ...draft, sort: 'distance' });
        setDraft((d) => ({ ...d, sort: 'distance' }));
      },
      () => setGeoError(true),
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  };

  const any = (label: string) => [{ value: '', label }];
  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={apply}
        className="grid gap-4 rounded-control border border-border bg-surface p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
        aria-label={t('filters')}
      >
        <Select
          label={t('species')}
          options={[...any(t('anySpecies')), ...speciesOptions]}
          value={draft.speciesId}
          onChange={(e) => set({ speciesId: e.target.value, sizeClassId: '' })}
        />
        <Select
          label={t('size')}
          options={[
            ...any(t('anySize')),
            ...sizes.map((s) => ({ value: String(s.id), label: sizeLabel(s, locale) })),
          ]}
          value={draft.sizeClassId}
          onChange={(e) => set({ sizeClassId: e.target.value })}
          disabled={sizes.length === 0}
        />
        <Select
          label={t('form')}
          options={[
            ...any(t('anyForm')),
            ...(['LIVE', 'CHILLED'] as const).map((f) => ({ value: f, label: tl(`form.${f}`) })),
          ]}
          value={draft.form}
          onChange={(e) => set({ form: e.target.value })}
        />
        <Select
          label={t('kind')}
          options={[
            ...any(t('anyKind')),
            ...(['AVAILABLE_NOW', 'FUTURE_HARVEST'] as const).map((k) => ({
              value: k,
              label: tl(`kind.${k}`),
            })),
          ]}
          value={draft.kind}
          onChange={(e) => set({ kind: e.target.value })}
        />
        <Select
          label={t('region')}
          options={[...any(t('anyRegion')), ...regions]}
          value={draft.regionId}
          onChange={(e) => set({ regionId: e.target.value })}
        />
        <Input
          label={t('availableOn')}
          type="date"
          value={draft.availableOn}
          onChange={(e) => set({ availableOn: e.target.value })}
        />
        <Input
          label={t('maxPrice')}
          inputMode="numeric"
          value={draft.maxPrice}
          onChange={(e) => set({ maxPrice: e.target.value })}
        />
        <Select
          label={t('sort')}
          options={(['score', 'price', 'distance', 'fresh'] as const)
            .filter((s) => s !== 'distance' || near)
            .map((s) => ({ value: s, label: t(`sorts.${s}`) }))}
          value={draft.sort}
          onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}
        />
        {near && (
          <Input
            label={t('radius')}
            inputMode="numeric"
            value={draft.radiusKm}
            onChange={(e) => set({ radiusKm: e.target.value })}
          />
        )}
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">{t('apply')}</Button>
          {near ? (
            <Button type="button" variant="secondary" onClick={() => setNear(null)}>
              {t('nearOff')}
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={locate}>
              {t('nearMe')}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              setApplied(EMPTY);
              setNear(null);
            }}
          >
            {t('reset')}
          </Button>
        </div>
      </form>
      {near && (
        <p className="text-ink-muted">{t('nearOn', { km: Number(applied.radiusKm) || 300 })}</p>
      )}
      {geoError && <Alert tone="warning">{t('geoDenied')}</Alert>}
      {error && (
        <Alert tone="danger" action={<Button onClick={() => void refetch()}>{t('apply')}</Button>}>
          {errorText(error)}
        </Alert>
      )}
      {data && items.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyHint')} />
      ) : (
        <ul
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="catalog"
          aria-busy={isFetching}
        >
          {items.map((l) => (
            <li key={l.id}>
              <PublicListingCard listing={l} near={near ?? undefined} />
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <Button
          variant="secondary"
          className="self-center"
          onClick={() => void fetchNextPage()}
          disabled={isFetching}
        >
          {tc('loadMore')}
        </Button>
      )}
    </div>
  );
}
