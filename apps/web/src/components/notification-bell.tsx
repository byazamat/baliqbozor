'use client';

import { cn } from '@baliqbozor/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap } from '@/lib/errors';

export const UNREAD_QUERY_KEY = ['notifications', 'unread'] as const;
/** Опрос счётчика до realtime (D-34): раз в 30 с и при возвращении на вкладку. */
export const UNREAD_POLL_MS = 30_000;

export function NotificationBell() {
  const t = useTranslations('web.inbox');
  const api = useApi();
  const { data } = useQuery({
    queryKey: UNREAD_QUERY_KEY,
    queryFn: async () => {
      const page = await unwrap(
        api.GET('/api/v1/notifications', { params: { query: { limit: 1 } } }),
      );
      return page.unreadCount;
    },
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const count = data ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={t('bell', { count })}
      data-testid="notification-bell"
      data-count={count}
      className={cn(
        'relative inline-flex size-11 items-center justify-center rounded-control text-brand-700 hover:bg-brand-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path
          d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-5 rounded-full bg-danger-600 px-1 text-center text-xs leading-5 font-semibold text-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
