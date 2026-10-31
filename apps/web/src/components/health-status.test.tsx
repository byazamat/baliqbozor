import { createApiClient } from '@baliqbozor/api-client';
import { messages } from '@baliqbozor/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider } from '@/lib/api';

import { HealthStatus } from './health-status';

afterEach(cleanup);

function renderWith(fetchImpl: typeof fetch, locale: 'uz' | 'ru' = 'uz') {
  const client = createApiClient({ baseUrl: 'http://api.test', fetch: fetchImpl });
  const queryClient = new QueryClient();
  render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider client={client}>
          <HealthStatus />
        </ApiProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const ok = () =>
  Promise.resolve(
    new Response(JSON.stringify({ status: 'ok', service: 'api' }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  );

describe('HealthStatus', () => {
  it('shows "ok" when API responds', async () => {
    renderWith(vi.fn<typeof fetch>(ok), 'ru');
    expect(screen.getByTestId('api-status').dataset.state).toBe('checking');
    await waitFor(() => expect(screen.getByTestId('api-status').dataset.state).toBe('ok'));
    expect(screen.getByText(messages.ru.health.ok)).toBeDefined();
  });

  it('shows "down" with retry, and recovers', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(ok);
    renderWith(fetchMock);

    await waitFor(() => expect(screen.getByTestId('api-status').dataset.state).toBe('down'));
    fireEvent.click(screen.getByRole('button', { name: messages.uz.common.retry }));
    await waitFor(() => expect(screen.getByTestId('api-status').dataset.state).toBe('ok'));
  });

  it('treats API error body as down', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'x' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    renderWith(fetchMock);
    await waitFor(() => expect(screen.getByTestId('api-status').dataset.state).toBe('down'));
  });
});
