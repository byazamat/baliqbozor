'use client';

import { Alert } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

import { ListingEditor } from '@/components/listing-editor';
import { Loading, Page } from '@/components/page';
import { SellerOnly } from '@/components/seller-only';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { listingsQueryKey } from '@/lib/listings';
import { orgHeaders, useCurrentOrg } from '@/lib/session';

export default function ListingPage() {
  const t = useTranslations('web.listings');
  return (
    <SellerOnly title={t('editTitle')}>
      <ListingLoader />
    </SellerOnly>
  );
}

function ListingLoader() {
  const t = useTranslations('web.listings');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const org = useCurrentOrg();
  const { data, error } = useQuery({
    queryKey: [...listingsQueryKey(org.id), 'one', id],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/seller/listings/{id}', {
          params: { path: { id }, header: orgHeaders(org.id) },
        }),
      ),
    // форма живёт своим состоянием; фоновые обновления её не перезаписывают
    refetchOnWindowFocus: false,
  });
  if (error) {
    return (
      <Page title={t('editTitle')}>
        <Alert tone="danger">{errorText(error)}</Alert>
      </Page>
    );
  }
  if (!data) return <Loading label={tc('loading')} />;
  return <ListingEditor key={data.id} listing={data} />;
}
