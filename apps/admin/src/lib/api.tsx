'use client';

import { type ApiClient, createApiClient } from '@baliqbozor/api-client';
import { useLocale } from 'next-intl';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  const locale = useLocale();
  const value = useMemo(
    () =>
      client ??
      createApiClient({
        baseUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
        getLocale: () => locale,
      }),
    [client, locale],
  );
  return <ApiContext value={value}>{children}</ApiContext>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>');
  return client;
}
