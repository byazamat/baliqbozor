'use client';

import { Alert, Button, Dialog, Input, Select, Textarea } from '@baliqbozor/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import { type LatLng, LocationMap } from '@/components/map';
import { MediaUploader } from '@/components/media-uploader';
import { Page, Section } from '@/components/page';
import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { useRegionOptions } from '@/lib/dict';
import { invalidFields, unwrap } from '@/lib/errors';
import { type Farm, farmsQueryKey, type MediaInfo, useIssueText } from '@/lib/listings';
import { orgHeaders, useCurrentOrg } from '@/lib/session';

const WATER = ['POND', 'RAS', 'CAGE', 'RACEWAY', 'OTHER'] as const;
type Water = (typeof WATER)[number];

interface Values {
  name: string;
  regionId: string;
  districtName: string;
  addressText: string;
  point: LatLng | null;
  waterBodyTypes: Water[];
  areaHa: string;
  description: string;
  media: MediaInfo[];
}

const toValues = (f: Farm | null): Values => ({
  name: f?.name ?? '',
  regionId: f ? String(f.region.id) : '',
  districtName: f?.districtName ?? '',
  addressText: f?.addressText ?? '',
  point: f ? { lat: Number(f.lat), lng: Number(f.lng) } : null,
  waterBodyTypes: f?.waterBodyTypes ?? [],
  areaHa: f?.areaHa ?? '',
  description: f?.description ?? '',
  media: f?.photos ?? [],
});

/** Создание и правка хозяйства с точкой на карте и фото (SPEC 8.2, 12.2). */
export function FarmEditor({ farm }: { farm: Farm | null }) {
  const t = useTranslations('web.farms');
  const tw = useTranslations('farm.waterBodyType');
  const tc = useTranslations('common');
  const issueText = useIssueText();
  const api = useApi();
  const org = useCurrentOrg();
  const router = useRouter();
  const queryClient = useQueryClient();
  const regions = useRegionOptions();
  const canEdit = org.role !== 'STAFF';

  const [values, setValues] = useState<Values>(() => toValues(farm));
  const [errors, setErrors] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const missing = new Set<string>();
    if (values.name.trim().length < 2) missing.add('name');
    if (!values.regionId) missing.add('regionId');
    if (!values.point) missing.add('lat');
    if (values.waterBodyTypes.length === 0) missing.add('waterBodyTypes');
    setErrors(missing);
    if (missing.size > 0 || !values.point) return;
    setBusy(true);
    setMessage(null);
    const body = {
      name: values.name.trim(),
      regionId: Number(values.regionId),
      districtName: values.districtName.trim(),
      addressText: values.addressText.trim(),
      lat: values.point.lat.toFixed(6),
      lng: values.point.lng.toFixed(6),
      waterBodyTypes: values.waterBodyTypes,
      ...(values.areaHa.trim() ? { areaHa: values.areaHa.trim().replace(',', '.') } : {}),
      description: values.description.trim(),
      mediaIds: values.media.filter((m) => m.status !== 'REJECTED').map((m) => m.id),
    };
    try {
      const saved = farm
        ? await unwrap(
            api.PATCH('/api/v1/farms/{id}', {
              params: { path: { id: farm.id }, header: orgHeaders(org.id) },
              body,
            }),
          )
        : await unwrap(api.POST('/api/v1/farms', { params: { header: orgHeaders(org.id) }, body }));
      await queryClient.invalidateQueries({ queryKey: farmsQueryKey(org.id) });
      if (farm) {
        setValues(toValues(saved));
        setMessage({ tone: 'success', text: tc('saved') });
      } else {
        router.replace({ pathname: '/farms', query: { created: '1' } });
      }
    } catch (err) {
      setErrors(invalidFields(err));
      setMessage({ tone: 'danger', text: issueText(err) });
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (isActive: boolean) => {
    if (!farm) return;
    setBusy(true);
    try {
      await unwrap(
        api.PATCH('/api/v1/farms/{id}', {
          params: { path: { id: farm.id }, header: orgHeaders(org.id) },
          body: { isActive },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: farmsQueryKey(org.id) });
      router.refresh();
      setConfirmOff(false);
      setMessage({ tone: 'success', text: tc('saved') });
    } catch (err) {
      setMessage({ tone: 'danger', text: issueText(err) });
    } finally {
      setBusy(false);
    }
  };

  const err = (field: string, text = tc('requiredField')) => (errors.has(field) ? text : undefined);

  return (
    <Page title={farm ? farm.name : t('newTitle')}>
      <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-6">
        <Section>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('name')}
              value={values.name}
              onChange={(e) => set({ name: e.target.value })}
              error={err('name')}
              required
              disabled={!canEdit}
              maxLength={120}
            />
            <Select
              label={t('region')}
              options={regions}
              placeholder="—"
              value={values.regionId}
              onChange={(e) => set({ regionId: e.target.value })}
              error={err('regionId')}
              required
              disabled={!canEdit}
            />
            <Input
              label={t('district')}
              value={values.districtName}
              onChange={(e) => set({ districtName: e.target.value })}
              disabled={!canEdit}
              maxLength={120}
            />
            <Input
              label={t('address')}
              value={values.addressText}
              onChange={(e) => set({ addressText: e.target.value })}
              disabled={!canEdit}
              maxLength={500}
            />
          </div>
        </Section>

        <Section title={t('point')}>
          <p className="mb-3 text-ink-muted">{t('pointHint')}</p>
          <LocationMap
            value={values.point}
            onChange={canEdit ? (point) => set({ point }) : undefined}
            label={t('point')}
          />
          {errors.has('lat') && (
            <p className="mt-2 font-medium text-danger-700" role="alert">
              {t('pointRequired')}
            </p>
          )}
        </Section>

        <Section>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium text-ink">{t('waterBodyTypes')}</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {WATER.map((w) => (
                <label key={w} className="inline-flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={values.waterBodyTypes.includes(w)}
                    disabled={!canEdit}
                    onChange={(e) =>
                      set({
                        waterBodyTypes: e.target.checked
                          ? [...values.waterBodyTypes, w]
                          : values.waterBodyTypes.filter((x) => x !== w),
                      })
                    }
                  />
                  {tw(w)}
                </label>
              ))}
            </div>
            {errors.has('waterBodyTypes') && (
              <p className="font-medium text-danger-700" role="alert">
                {tc('requiredField')}
              </p>
            )}
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label={t('area')}
              inputMode="decimal"
              value={values.areaHa}
              onChange={(e) => set({ areaHa: e.target.value })}
              error={err('areaHa', tc('invalidValue'))}
              disabled={!canEdit}
            />
          </div>
          <Textarea
            className="mt-4"
            label={t('description')}
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
            disabled={!canEdit}
            maxLength={2000}
          />
        </Section>

        <Section title={t('photos')}>
          <MediaUploader
            orgId={org.id}
            purpose="FARM_PHOTO"
            label={t('photos')}
            value={values.media}
            onChange={(media) => set({ media })}
            disabled={!canEdit}
          />
        </Section>

        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {canEdit && (
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" disabled={busy}>
              {tc('save')}
            </Button>
            {farm &&
              (farm.isActive ? (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setConfirmOff(true)}
                  disabled={busy}
                >
                  {t('deactivate')}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void setActive(true)}
                  disabled={busy}
                >
                  {t('activate')}
                </Button>
              ))}
          </div>
        )}
      </form>
      <Dialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={t('deactivateTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOff(false)}>
              {tc('cancel')}
            </Button>
            <Button variant="danger" onClick={() => void setActive(false)} disabled={busy}>
              {t('deactivate')}
            </Button>
          </>
        }
      >
        {t('deactivateText')}
      </Dialog>
    </Page>
  );
}
