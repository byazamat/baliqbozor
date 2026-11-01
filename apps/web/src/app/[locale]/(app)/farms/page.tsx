'use client';

import { Alert, Badge, Button, EmptyState } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { Loading, Page, Section } from '@/components/page';
import { SellerOnly } from '@/components/seller-only';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { regionName } from '@/lib/dict';
import { unwrap, useErrorText } from '@/lib/errors';
import { farmsQueryKey } from '@/lib/listings';
import { orgHeaders, useCurrentOrg } from '@/lib/session';

export default function FarmsPage() {
  const t = useTranslations('web.farms');
  return (
    <SellerOnly title={t('title')}>
      <FarmsList />
    </SellerOnly>
  );
}

function FarmsList() {
  const t = useTranslations('web.farms');
  const tw = useTranslations('farm.waterBodyType');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const locale = useLocale();
  const api = useApi();
  const org = useCurrentOrg();
  const created = useSearchParams().get('created') === '1';
  const { data, error, refetch } = useQuery({
    queryKey: farmsQueryKey(org.id),
    queryFn: () => unwrap(api.GET('/api/v1/farms', { params: { header: orgHeaders(org.id) } })),
  });
  const canEdit = org.role !== 'STAFF';
  const add = canEdit && (
    <Link
      href="/farms/new"
      className="inline-flex min-h-11 items-center rounded-control bg-brand-700 px-4 font-medium text-white hover:bg-brand-800"
    >
      {t('add')}
    </Link>
  );

  if (error) {
    return (
      <Page title={t('title')}>
        <Alert tone="danger" action={<Button onClick={() => void refetch()}>{tc('retry')}</Button>}>
          {errorText(error)}
        </Alert>
      </Page>
    );
  }
  if (!data) return <Loading label={tc('loading')} />;
  return (
    <Page title={t('title')} aside={data.length > 0 ? add : undefined}>
      {created && <Alert tone="success">{t('created')}</Alert>}
      {data.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyHint')} action={add || undefined} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="farms">
          {data.map((f) => (
            <li key={f.id}>
              <Section className="h-full">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/farms/${f.id}`}
                    className="text-lg font-semibold text-brand-700 hover:underline"
                  >
                    {f.name}
                  </Link>
                  <Badge tone={f.isActive ? 'success' : 'neutral'}>
                    {f.isActive ? t('active') : t('inactive')}
                  </Badge>
                </div>
                <p className="mt-1 text-ink-muted">
                  {[regionName(f.region, locale), f.districtName].filter(Boolean).join(', ')}
                </p>
                <p className="mt-1 text-ink-muted">
                  {f.waterBodyTypes.map((w) => tw(w)).join(', ')}
                </p>
                <p className="mt-2">{t('activeListings', { count: f.activeListings })}</p>
              </Section>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
