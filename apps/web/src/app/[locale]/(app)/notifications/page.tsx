'use client';

import { formatDateTime } from '@baliqbozor/i18n';
import { Alert, Badge, Button, cn, EmptyState } from '@baliqbozor/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { UNREAD_QUERY_KEY } from '@/components/notification-bell';
import { Loading, Page } from '@/components/page';
import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { ME_QUERY_KEY } from '@/lib/session';

const LIST_KEY = ['notifications', 'list'] as const;

/** In-app уведомления (SPEC 10.3, D-33): список, «прочитано», «все прочитаны». */
export default function NotificationsPage() {
  const t = useTranslations('web.inbox');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const api = useApi();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: LIST_KEY,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/notifications', {
          params: { query: { limit: 20, ...(pageParam ? { cursor: pageParam } : {}) } },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: LIST_KEY }),
      queryClient.invalidateQueries({ queryKey: UNREAD_QUERY_KEY }),
      // Решение по верификации меняет статус организации в /me.
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
    ]);

  const act = (promise: Promise<unknown>) => {
    setError(null);
    promise.then(refresh).catch((err: unknown) => setError(errorText(err)));
  };

  if (query.isPending) return <Loading label={tc('loading')} />;
  if (query.isError) {
    return (
      <Page title={t('title')}>
        <Alert
          tone="danger"
          action={<Button onClick={() => void query.refetch()}>{tc('retry')}</Button>}
        >
          {errorText(query.error)}
        </Alert>
      </Page>
    );
  }

  const items = query.data.pages.flatMap((p) => p.items);
  const unread = query.data.pages[0]?.unreadCount ?? 0;

  return (
    <Page
      title={t('title')}
      aside={
        unread > 0 ? (
          <Button
            variant="secondary"
            onClick={() => act(unwrap(api.POST('/api/v1/notifications/read-all')))}
          >
            {t('markAllRead')}
          </Button>
        ) : undefined
      }
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {items.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyHint')} />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="notifications">
          {items.map((n) => (
            <li
              key={n.id}
              data-unread={n.readAt ? undefined : 'true'}
              className={cn(
                'flex flex-wrap items-start justify-between gap-3 rounded-control border bg-surface p-4',
                n.readAt ? 'border-border' : 'border-brand-600',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-ink">{n.title}</h2>
                  {!n.readAt && <Badge tone="info">{t('unread')}</Badge>}
                </div>
                <p className="mt-1 text-ink">{n.body}</p>
                <p className="mt-1 text-sm text-ink-muted">{formatDateTime(n.createdAt)}</p>
                {typeof n.data?.listingId === 'string' && (
                  <Link
                    href={`/listings/${n.data.listingId}`}
                    className="mt-1 inline-flex min-h-11 items-center font-medium text-brand-700 hover:underline"
                  >
                    {tc('open')}
                  </Link>
                )}
              </div>
              {!n.readAt && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    act(
                      unwrap(
                        api.POST('/api/v1/notifications/{id}/read', {
                          params: { path: { id: n.id } },
                        }),
                      ),
                    )
                  }
                >
                  {t('markRead')}
                </Button>
              )}
            </li>
          ))}
        </ul>
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
