import type { ApiClient } from '@baliqbozor/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type i18n } from 'i18next';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiProvider } from './api/context';
import { createI18n } from './i18n';
import { HomeScreen } from './screens/home-screen';

export interface AppProps {
  /** Для тестов: подмена клиента API и i18n. */
  apiClient?: ApiClient;
  i18nInstance?: i18n;
  queryClient?: QueryClient;
}

export function App({ apiClient, i18nInstance, queryClient: injectedQueryClient }: AppProps) {
  const [i18n] = useState(() => i18nInstance ?? createI18n());
  const [queryClient] = useState(() => injectedQueryClient ?? new QueryClient());

  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ApiProvider {...(apiClient ? { client: apiClient } : {})}>
            <StatusBar barStyle="dark-content" />
            <HomeScreen />
          </ApiProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
