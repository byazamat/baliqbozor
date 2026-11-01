'use client';

import { formatDateTime, formatKg, formatPricePerKg } from '@baliqbozor/i18n';
import { Alert, Button, cn, EmptyState } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { ListingActions, ListingStatusBadge } from '@/components/listing-actions';
import { Loading, Page, Section } from '@/components/page';
import { SellerOnly } from '@/components/seller-only';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import {
  farmsQueryKey,
  type ListingStatus,
  listingsQueryKey,
  sizeLabel,
  speciesName,
} from '@/lib/listings';
import { orgHeaders, useCurrentOrg } from '@/lib/session';

const TABS: (ListingStatus | 'ALL')[] = [
  'ALL',
  'ACTIVE',
  'PAUSED',
  'DRAFT',
  'SOLD_OUT',
  'EXPIRED',
  'ARCHIVED',
];
const DAY = 24 * 60 * 60 * 1000;

export default function ListingsPage() {
  const t = useTranslations('web.listings');
  return (
    <SellerOnly title={t('title')}>
      <Listings />
    </SellerOnly>
  );
}

function Listings() {
  const t = useTranslations('web.listings');
  const tl = useTranslations('listing');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const locale = useLocale();
  const api = useApi();
  const org = useCurrentOrg();
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL');
  // момент открытия страницы: «истекает в ближайшие сутки» считается от него
  const [now] = useState(() => Date.now());

  const { data: farms } = useQuery({
    queryKey: farmsQueryKey(org.id),
    queryFn: () => unwrap(api.GET('/api/v1/farms', { params: { header: orgHeaders(org.id) } })),
  });
  const { data, error, refetch } = useQuery({
    queryKey: [...listingsQueryKey(org.id), tab],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/seller/listings', {
          params: {
            header: orgHeaders(org.id),
            query: { limit: 100, ...(tab === 'ALL' ? {} : { status: tab }) },
          },
        }),
      ),
  });

  const canEdit = org.role !== 'STAFF';
  const hasFarm = (farms ?? []).some((f) => f.isActive);
  const add = canEdit && hasFarm && (
    <Link
      href="/listings/new"
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
  if (!data || !farms) return <Loading label={tc('loading')} />;
  const items = data.items;
  const expiring = items.filter(
    (l) => l.freshnessDueAt && new Date(l.freshnessDueAt).getTime() - now < DAY,
  );

  return (
    <Page title={t('title')} aside={add || undefined}>
      {!hasFarm && (
        <Alert
          tone="info"
          action={
            canEdit ? (
              <Link href="/farms/new" className="font-medium text-brand-700 underline">
                {t('noFarms')}
              </Link>
            ) : undefined
          }
        >
          {t('noFarms')}
        </Alert>
      )}
      {expiring.length > 0 && (
        <Alert tone="warning" title={t('expiring')}>
          {t('expiringHint')}
        </Alert>
      )}
      <div role="tablist" aria-label={t('title')} className="flex flex-wrap gap-1">
        {TABS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={cn(
              'min-h-11 rounded-control px-3 font-medium',
              tab === s ? 'bg-brand-50 text-brand-800' : 'text-ink-muted hover:text-ink',
            )}
          >
            {s === 'ALL' ? t('all') : tl(`status.${s}`)}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={tab === 'ALL' ? t('empty') : t('emptyStatus')}
          description={tab === 'ALL' ? t('emptyHint') : undefined}
          action={tab === 'ALL' ? add || undefined : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-4" data-testid="listings">
          {items.map((l) => (
            <li key={l.id}>
              <Section>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/listings/${l.id}`}
                    className="text-lg font-semibold text-brand-700 hover:underline"
                  >
                    {speciesName(l.species, locale)}, {sizeLabel(l.sizeClass, locale)} ·{' '}
                    {tl(`form.${l.form}`)}
                  </Link>
                  <ListingStatusBadge listing={l} />
                </div>
                <p className="mt-1 text-ink-muted">
                  {l.farm.name} · {tl(`kind.${l.kind}`)}
                  {l.hasVideo ? ` · ${tl('hasVideo')}` : ''}
                </p>
                <p className="mt-2 text-ink">
                  {t('available')}: <b>{formatKg(l.availableKg, locale)}</b> ·{' '}
                  {l.pricePerKg ? formatPricePerKg(l.pricePerKg, locale) : tl('negotiable')}
                </p>
                {l.freshnessDueAt && (
                  <p className="mt-1 text-ink-muted">
                    {t('freshUntil', { date: formatDateTime(l.freshnessDueAt) })}
                  </p>
                )}
                <div className="mt-3">
                  <ListingActions listing={l} compact />
                </div>
              </Section>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
