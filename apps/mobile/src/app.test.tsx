import { createApiClient } from '@baliqbozor/api-client';
import { messages } from '@baliqbozor/i18n';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { App } from './app';
import { createI18n } from './i18n';

const okResponse = () =>
  Promise.resolve(
    new Response(JSON.stringify({ status: 'ok', service: 'api' }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );

// gcTime: Infinity — без таймеров сборки кэша, чтобы Jest завершался сразу.
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

afterEach(() => queryClient.clear());

async function renderApp(fetchImpl: typeof fetch) {
  const apiClient = createApiClient({ baseUrl: 'http://api.test', fetch: fetchImpl });
  return render(
    <App apiClient={apiClient} i18nInstance={createI18n()} queryClient={queryClient} />,
  );
}

describe('App', () => {
  it('renders uz by default and shows API ok', async () => {
    await renderApp(jest.fn(okResponse));
    expect(screen.getByText(messages.uz.mobile.home.title)).toBeTruthy();
    expect(screen.getByTestId('api-status')).toHaveTextContent(messages.uz.health.checking);
    await waitFor(() =>
      expect(screen.getByTestId('api-status')).toHaveTextContent(messages.uz.health.ok),
    );
  });

  it('switches language to ru', async () => {
    await renderApp(jest.fn(okResponse));
    await fireEvent.press(screen.getByText(messages.uz.common.languages.ru));
    expect(await screen.findByText(messages.ru.mobile.home.title)).toBeTruthy();
  });

  it('shows down state with retry', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockImplementation(okResponse);
    await renderApp(fetchMock);

    await waitFor(() =>
      expect(screen.getByTestId('api-status')).toHaveTextContent(messages.uz.health.down),
    );
    await fireEvent.press(screen.getByRole('button', { name: messages.uz.common.retry }));
    await waitFor(() =>
      expect(screen.getByTestId('api-status')).toHaveTextContent(messages.uz.health.ok),
    );
  });
});
