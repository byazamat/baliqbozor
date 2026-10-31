import { type ApiClient, createApiClient } from '@baliqbozor/api-client';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { API_URL } from '../config';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  const { i18n } = useTranslation();
  const value = useMemo(
    () => client ?? createApiClient({ baseUrl: API_URL, getLocale: () => i18n.language }),
    [client, i18n],
  );
  return <ApiContext value={value}>{children}</ApiContext>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>');
  return client;
}
