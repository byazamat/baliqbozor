'use client';

import { tashkentDate } from '@baliqbozor/domain';
import { formatDateTime, formatKg } from '@baliqbozor/i18n';
import { Alert, Button, Input, Select, Textarea } from '@baliqbozor/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import { ListingActions, ListingStatusBadge } from '@/components/listing-actions';
import { MediaUploader } from '@/components/media-uploader';
import { Page, Section } from '@/components/page';
import { Link, useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { invalidFields, unwrap } from '@/lib/errors';
import {
  farmsQueryKey,
  type Listing,
  listingsQueryKey,
  type MediaInfo,
  sizeLabel,
  speciesName,
  trimWeight,
  useIssueText,
  useSpeciesOptions,
} from '@/lib/listings';
import { orgHeaders, useCurrentOrg } from '@/lib/session';

/** Значения по умолчанию `order.minOrderKg` и `listing.nowMaxDaysAhead` (SPEC 8.13); сервер проверит. */
const MIN_ORDER_KG = 100;
const NOW_DAYS = 7;

interface Values {
  farmId: string;
  speciesId: string;
  sizeClassId: string;
  form: 'LIVE' | 'CHILLED';
  kind: 'AVAILABLE_NOW' | 'FUTURE_HARVEST';
  volumeKg: string;
  minOrderKg: string;
  priceType: 'FIXED' | 'NEGOTIABLE';
  pricePerKg: string;
  availableFrom: string;
  availableTo: string;
  description: string;
  media: MediaInfo[];
}

const toValues = (l: Listing | null): Values => ({
  farmId: l?.farm.id ?? '',
  speciesId: l ? String(l.species.id) : '',
  sizeClassId: l ? String(l.sizeClass.id) : '',
  form: l?.form ?? 'LIVE',
  kind: l?.kind ?? 'AVAILABLE_NOW',
  volumeKg: l ? trimWeight(l.volumeKg) : '',
  minOrderKg: l ? trimWeight(l.minOrderKg) : String(MIN_ORDER_KG),
  priceType: l?.priceType ?? 'FIXED',
  pricePerKg: l?.pricePerKg ?? '',
  availableFrom: l?.availableFrom ?? tashkentDate(new Date()),
  availableTo: l?.availableTo ?? '',
  description: l?.description ?? '',
  media: l?.media ?? [],
});

const num = (v: string) => v.trim().replace(/\s/g, '').replace(',', '.');

/** Форма наличия в порядке SPEC 12.2: вид → размер → форма → объём → партия → цена → окно → фото. */
export function ListingEditor({ listing }: { listing: Listing | null }) {
  const t = useTranslations('web.listings');
  const tl = useTranslations('listing');
  const tc = useTranslations('common');
  const locale = useLocale();
  const issueText = useIssueText();
  const api = useApi();
  const org = useCurrentOrg();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { species, options: speciesOptions } = useSpeciesOptions();
  const { data: farms = [] } = useQuery({
    queryKey: farmsQueryKey(org.id),
    queryFn: () => unwrap(api.GET('/api/v1/farms', { params: { header: orgHeaders(org.id) } })),
  });

  const [values, setValues] = useState<Values>(() => toValues(listing));
  const [current, setCurrent] = useState(listing);
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  const canEdit = org.role !== 'STAFF' && current?.status !== 'ARCHIVED';
  const draft = !current || current.status === 'DRAFT';
  const sizes = species.find((s) => String(s.id) === values.speciesId)?.sizeClasses ?? [];
  const farmOptions = farms
    .filter((f) => f.isActive || f.id === values.farmId)
    .map((f) => ({ value: f.id, label: f.name }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const missing = new Set<string>();
    for (const f of ['farmId', 'speciesId', 'sizeClassId', 'volumeKg', 'availableFrom'] as const) {
      if (!values[f].trim()) missing.add(f);
    }
    if (values.priceType === 'FIXED' && !values.pricePerKg.trim()) missing.add('pricePerKg');
    setErrors(missing);
    if (missing.size > 0) return;
    setBusy(true);
    setMessage(null);
    const body = {
      ...(draft
        ? {
            farmId: values.farmId,
            speciesId: Number(values.speciesId),
            sizeClassId: Number(values.sizeClassId),
            form: values.form,
          }
        : {}),
      kind: values.kind,
      volumeKg: num(values.volumeKg),
      minOrderKg: num(values.minOrderKg),
      priceType: values.priceType,
      pricePerKg: values.priceType === 'FIXED' ? num(values.pricePerKg) : null,
      availableFrom: values.availableFrom,
      availableTo: values.availableTo || null,
      description: values.description.trim(),
      mediaIds: values.media.filter((m) => m.status !== 'REJECTED').map((m) => m.id),
    };
    try {
      if (current) {
        const saved = await unwrap(
          api.PATCH('/api/v1/listings/{id}', {
            params: { path: { id: current.id }, header: orgHeaders(org.id) },
            body,
          }),
        );
        setCurrent(saved);
        setValues(toValues(saved));
        setMessage({ tone: 'success', text: tc('saved') });
      } else {
        const created = await unwrap(
          api.POST('/api/v1/listings', {
            params: { header: orgHeaders(org.id) },
            body: {
              ...body,
              farmId: values.farmId,
              speciesId: Number(values.speciesId),
              sizeClassId: Number(values.sizeClassId),
              form: values.form,
            },
          }),
        );
        router.replace(`/listings/${created.id}`);
      }
      await queryClient.invalidateQueries({ queryKey: listingsQueryKey(org.id) });
    } catch (err) {
      setErrors(invalidFields(err));
      setMessage({ tone: 'danger', text: issueText(err) });
    } finally {
      setBusy(false);
    }
  };

  const err = (field: string) => (errors.has(field) ? tc('invalidValue') : undefined);
  const title = current
    ? `${speciesName(current.species, locale)}, ${sizeLabel(current.sizeClass, locale)}`
    : t('newTitle');

  if (!current && farms.length > 0 && farmOptions.length === 0) {
    return (
      <Page title={t('newTitle')}>
        <Alert tone="info">{t('noFarms')}</Alert>
      </Page>
    );
  }

  return (
    <Page title={title} aside={current && <ListingStatusBadge listing={current} />}>
      {current && (
        <Section>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('available')} value={formatKg(current.availableKg, locale)} />
            <Stat label={t('reserved')} value={formatKg(current.reservedKg, locale)} />
            <Stat label={t('sold')} value={formatKg(current.soldKg, locale)} />
            {current.freshnessDueAt && (
              <Stat
                label={tl('status.ACTIVE')}
                value={t('freshUntil', { date: formatDateTime(current.freshnessDueAt) })}
              />
            )}
          </dl>
          <div className="mt-4">
            {org.role === 'STAFF' && <p className="mb-3 text-ink-muted">{t('staffHint')}</p>}
            <ListingActions
              listing={current}
              onChanged={(l) => {
                setCurrent(l);
                setValues(toValues(l));
              }}
            />
          </div>
        </Section>
      )}

      <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-6">
        <Section>
          {!draft && canEdit && <p className="mb-3 text-ink-muted">{t('draftOnlyHint')}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t('farm')}
              options={farmOptions}
              placeholder="—"
              value={values.farmId}
              onChange={(e) => set({ farmId: e.target.value })}
              error={err('farmId')}
              disabled={!canEdit || !draft}
              required
            />
            <Select
              label={t('species')}
              options={speciesOptions}
              placeholder="—"
              value={values.speciesId}
              onChange={(e) => set({ speciesId: e.target.value, sizeClassId: '' })}
              error={err('speciesId')}
              disabled={!canEdit || !draft}
              required
            />
            <Select
              label={t('size')}
              options={sizes.map((s) => ({ value: String(s.id), label: sizeLabel(s, locale) }))}
              placeholder="—"
              value={values.sizeClassId}
              onChange={(e) => set({ sizeClassId: e.target.value })}
              error={err('sizeClassId')}
              disabled={!canEdit || !draft || sizes.length === 0}
              required
            />
            <Select
              label={t('form')}
              options={(['LIVE', 'CHILLED'] as const).map((f) => ({
                value: f,
                label: tl(`form.${f}`),
              }))}
              value={values.form}
              onChange={(e) => set({ form: e.target.value as Values['form'] })}
              disabled={!canEdit || !draft}
            />
            <Input
              label={t('volume')}
              inputMode="decimal"
              value={values.volumeKg}
              onChange={(e) => set({ volumeKg: e.target.value })}
              error={err('volumeKg')}
              disabled={!canEdit}
              required
            />
            <Input
              label={t('minOrder')}
              hint={t('minOrderHint', { min: MIN_ORDER_KG })}
              inputMode="decimal"
              value={values.minOrderKg}
              onChange={(e) => set({ minOrderKg: e.target.value })}
              error={err('minOrderKg')}
              disabled={!canEdit}
            />
            <Select
              label={t('priceType')}
              options={(['FIXED', 'NEGOTIABLE'] as const).map((p) => ({
                value: p,
                label: tl(`priceType.${p}`),
              }))}
              value={values.priceType}
              onChange={(e) => set({ priceType: e.target.value as Values['priceType'] })}
              disabled={!canEdit}
            />
            {values.priceType === 'FIXED' && (
              <Input
                label={t('price')}
                inputMode="numeric"
                value={values.pricePerKg}
                onChange={(e) => set({ pricePerKg: e.target.value })}
                error={err('pricePerKg')}
                disabled={!canEdit}
                required
              />
            )}
          </div>
        </Section>

        <Section>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label={t('kind')}
              hint={t('nowHint', { days: NOW_DAYS })}
              options={(['AVAILABLE_NOW', 'FUTURE_HARVEST'] as const).map((k) => ({
                value: k,
                label: tl(`kind.${k}`),
              }))}
              value={values.kind}
              onChange={(e) => set({ kind: e.target.value as Values['kind'] })}
              disabled={!canEdit}
            />
            <Input
              label={t('availableFrom')}
              type="date"
              value={values.availableFrom}
              onChange={(e) => set({ availableFrom: e.target.value })}
              error={err('availableFrom')}
              disabled={!canEdit}
              required
            />
            <Input
              label={t('availableTo')}
              hint={t('availableToHint')}
              type="date"
              value={values.availableTo}
              onChange={(e) => set({ availableTo: e.target.value })}
              error={err('availableTo')}
              disabled={!canEdit}
            />
          </div>
        </Section>

        <Section title={t('media')}>
          <MediaUploader
            orgId={org.id}
            purpose="LISTING_MEDIA"
            label={t('media')}
            hint={t('mediaHint')}
            value={values.media}
            onChange={(media) => set({ media })}
            disabled={!canEdit}
          />
          <Textarea
            className="mt-4"
            label={t('description')}
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
            disabled={!canEdit}
            maxLength={2000}
          />
        </Section>

        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && (
            <Button type="submit" size="lg" disabled={busy}>
              {current ? tc('save') : t('create')}
            </Button>
          )}
          <Link href="/listings" className="text-brand-700 hover:underline">
            {tc('back')}
          </Link>
        </div>
      </form>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
