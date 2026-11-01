'use client';

import { Alert } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

import { FarmEditor } from '@/components/farm-editor';
import { Loading, Page } from '@/components/page';
import { SellerOnly } from '@/components/seller-only';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { farmsQueryKey } from '@/lib/listings';
import { orgHeaders, useCurrentOrg } from '@/lib/session';

export default function FarmPage() {
  const t = useTranslations('web.farms');
  return (
    <SellerOnly title={t('editTitle')}>
      <FarmLoader />
    </SellerOnly>
  );
}

function FarmLoader() {
  const t = useTranslations('web.farms');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const org = useCurrentOrg();
  const { data, error } = useQuery({
    queryKey: [...farmsQueryKey(org.id), id],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/farms/{id}', { params: { path: { id }, header: orgHeaders(org.id) } }),
      ),
  });
  if (error) {
    return (
      <Page title={t('editTitle')}>
        <Alert tone="danger">{errorText(error)}</Alert>
      </Page>
    );
  }
  if (!data) return <Loading label={tc('loading')} />;
  // key: после смены хозяйства или сохранения форма берёт свежие данные.
  return <FarmEditor key={`${data.id}:${data.updatedAt}`} farm={data} />;
}
