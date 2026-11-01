import { createApiClient, SessionManager } from '@baliqbozor/api-client';
import { messages } from '@baliqbozor/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider } from '@/lib/api';
import { SessionProvider } from '@/lib/session';

import { LoginForm, safeNext } from './login-form';

const replace = vi.fn();
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('next=/org/team'),
}));

afterEach(() => {
  cleanup();
  replace.mockReset();
});

/** Адрес запроса из аргумента fetch (в тестах сессии — строка). */
const urlOf = (input: RequestInfo | URL) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ru = messages.ru;

function renderLogin(api: typeof fetch, session: typeof fetch) {
  render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <QueryClientProvider client={new QueryClient()}>
        <ApiProvider
          client={createApiClient({ baseUrl: 'http://api.test', fetch: api })}
          session={new SessionManager({ fetch: session })}
        >
          <SessionProvider>
            <LoginForm />
          </SessionProvider>
        </ApiProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('safeNext', () => {
  it('allows only internal paths', () => {
    expect(safeNext('/org/team')).toBe('/org/team');
    expect(safeNext('//evil.test')).toBeNull();
    expect(safeNext('/\\evil.test')).toBeNull();
    expect(safeNext('https://evil.test')).toBeNull();
    expect(safeNext('/login')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe('LoginForm', () => {
  it('phone → code → signs in and goes to ?next in the user locale', async () => {
    const api = vi.fn<typeof fetch>((input) => {
      const url = (input as Request).url;
      if (url.endsWith('/auth/otp/request'))
        return Promise.resolve(json(200, { resendAfterSec: 60 }));
      return Promise.resolve(json(200, { id: 'u1', organizations: [] }));
    });
    const session = vi.fn<typeof fetch>((input) => {
      const url = urlOf(input);
      if (url.endsWith('/refresh')) return Promise.resolve(json(401, null));
      return Promise.resolve(
        json(200, {
          accessToken: 'a',
          accessTokenExpiresIn: 900,
          isNewUser: false,
          user: { id: 'u1', locale: 'uz' },
        }),
      );
    });
    renderLogin(api, session);

    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.sendCode }));
    expect(await screen.findByText(ru.auth.login.invalidPhone)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/Номер телефона/), { target: { value: '901234567' } });
    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.sendCode }));
    expect(await screen.findByTestId('code-sent')).toBeDefined();
    expect(screen.getByText(/Повторно отправить код можно через 60/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.submit }));
    expect(await screen.findByText(ru.auth.login.invalidCode)).toBeDefined();

    fireEvent.change(screen.getByLabelText(/Код из SMS/), { target: { value: '12a3456' } });
    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.submit }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/org/team', { locale: 'uz' }));
    const login = session.mock.calls.find(([url]) => urlOf(url).endsWith('/login'));
    expect(JSON.parse(login?.[1]?.body as string)).toEqual({
      phone: '+998901234567',
      code: '123456',
    });
  });

  it('shows errors by code, with retry hint for rate limits', async () => {
    const api = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        json(429, {
          error: {
            code: 'RATE_LIMITED',
            message: 'x',
            requestId: 'r',
            details: { retryAfterSec: 42 },
          },
        }),
      ),
    );
    const session = vi.fn<typeof fetch>(() => Promise.resolve(json(401, null)));
    renderLogin(api, session);
    fireEvent.change(screen.getByLabelText(/Номер телефона/), { target: { value: '901234567' } });
    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.sendCode }));
    expect(
      await screen.findByText(`${ru.errors.RATE_LIMITED}. Попробуйте снова через 42 с`),
    ).toBeDefined();
  });

  it('shows OTP errors from the session handler', async () => {
    const api = vi.fn<typeof fetch>(() => Promise.resolve(json(200, { resendAfterSec: 0 })));
    const session = vi.fn<typeof fetch>((input) =>
      Promise.resolve(
        urlOf(input).endsWith('/refresh')
          ? json(401, null)
          : json(400, { error: { code: 'OTP_EXPIRED', message: 'x', requestId: 'r' } }),
      ),
    );
    renderLogin(api, session);
    fireEvent.change(screen.getByLabelText(/Номер телефона/), { target: { value: '901234567' } });
    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.sendCode }));
    fireEvent.change(await screen.findByLabelText(/Код из SMS/), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.submit }));
    expect(await screen.findByText(ru.errors.OTP_EXPIRED)).toBeDefined();
    // Таймер истёк — можно запросить код снова или сменить номер.
    expect(screen.getByRole('button', { name: ru.auth.login.resend })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: ru.auth.login.changePhone }));
    expect(screen.getByRole('button', { name: ru.auth.login.sendCode })).toBeDefined();
  });
});
