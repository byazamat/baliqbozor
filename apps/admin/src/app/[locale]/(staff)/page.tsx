'use client';

import type { components } from '@baliqbozor/api-client';
import { OrgType, VerificationStatus } from '@baliqbozor/domain';
import { formatDate } from '@baliqbozor/i18n';
import { Alert, Button, EmptyState, Input, Select } from '@baliqbozor/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import { Page } from '@/components/page';
import { VerificationBadge } from '@/components/status-badge';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';

type Status = components['schemas']['VerificationStatus'];
type Type = components['schemas']['OrgType'];

/** Очередь верификации (SPEC 12.3): по умолчанию — организации на проверке, поиск и фильтры. */
export default function QueuePage() {
  const t = useTranslations('admin.queue');
  const tOrg = useTranslations('org');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const locale = useLocale();
  const api = useApi();

  const [status, setStatus] = useState<Status | ''>('PENDING');
  const [type, setType] = useState<Type | ''>('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  const query = useInfiniteQuery({
    queryKey: ['admin', 'orgs', { status, type, q }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/admin/orgs', {
          params: {
            query: {
              limit: 50,
              ...(status ? { status } : {}),
              ...(type ? { type } : {}),
              ...(q ? { q } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
  });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setQ(search.trim());
  };
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = status !== 'PENDING' || type !== '' || q !== '';

  return (
    <Page title={t('title')}>
      <form
        onSubmit={onSearch}
        className="grid items-end gap-3 rounded-control border border-border bg-surface p-4 sm:grid-cols-[1fr_12rem_12rem_auto]"
        role="search"
      >
        <Input
          label={t('search')}
          hint={t('searchHint')}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label={t('status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | '')}
          options={[
            { value: '', label: t('allStatuses') },
            ...Object.values(VerificationStatus).map((s) => ({
              value: s,
              label: tOrg(`status.${s}`),
            })),
          ]}
        />
        <Select
          label={t('type')}
          value={type}
          onChange={(e) => setType(e.target.value as Type | '')}
          options={[
            { value: '', label: t('allTypes') },
            ...Object.values(OrgType).map((v) => ({ value: v, label: tOrg(`type.${v}`) })),
          ]}
        />
        <Button type="submit">{tc('search')}</Button>
      </form>

      {query.isError && (
        <Alert
          tone="danger"
          action={<Button onClick={() => void query.refetch()}>{tc('retry')}</Button>}
        >
          {errorText(query.error)}
        </Alert>
      )}
      {query.isPending && <p className="text-ink-muted">{tc('loading')}</p>}
      {query.isSuccess && items.length === 0 && (
        <EmptyState title={filtered ? t('emptyFiltered') : t('empty')} />
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto rounded-control border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-left" data-testid="orgs-table">
            <caption className="sr-only">{t('caption')}</caption>
            <thead className="border-b border-border bg-surface-muted text-sm text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('name')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('type')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('tin')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('region')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('status')}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t('createdAt')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((o) => (
                <tr key={o.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <Link
                      href={`/orgs/${o.id}`}
                      className="font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{tOrg(`type.${o.type}`)}</td>
                  <td className="px-4 py-3 tabular-nums">{o.tin ?? '—'}</td>
                  <td className="px-4 py-3">
                    {(locale === 'ru' ? o.regionNameRu : o.regionNameUz) ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <VerificationBadge status={o.verificationStatus} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          className="self-center"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {tc('loadMore')}
        </Button>
      )}
    </Page>
  );
}
