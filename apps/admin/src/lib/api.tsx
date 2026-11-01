'use client';

import { type ApiClient, createApiClient, SessionManager } from '@baliqbozor/api-client';
import { useLocale } from 'next-intl';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

interface ApiContextValue {
  client: ApiClient;
  session: SessionManager;
}

const ApiContext = createContext<ApiContextValue | null>(null);

/** Клиент API и сессия (D-31): access-токен из памяти, при 401 — обновление и повтор. */
export function ApiProvider({
  client,
  session: sessionProp,
  children,
}: {
  client?: ApiClient;
  session?: SessionManager;
  children: ReactNode;
}) {
  const locale = useLocale();
  const [session] = useState(() => sessionProp ?? new SessionManager({ lockName: 'bb-admin' }));
  const value = useMemo(
    () => ({
      session,
      client:
        client ??
        createApiClient({
          baseUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
          getLocale: () => locale,
          getAccessToken: () => session.getAccessToken(),
          fetch: session.fetch,
        }),
    }),
    [client, locale, session],
  );
  return <ApiContext value={value}>{children}</ApiContext>;
}

function useApiContext(): ApiContextValue {
  const value = useContext(ApiContext);
  if (!value) throw new Error('useApi must be used inside <ApiProvider>');
  return value;
}

export function useApi(): ApiClient {
  return useApiContext().client;
}

export function useSessionManager(): SessionManager {
  return useApiContext().session;
}
