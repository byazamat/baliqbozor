'use client';

import { Alert, Button, Input, isCompletePhone, PhoneInput } from '@baliqbozor/ui';
import { formatPhone } from '@baliqbozor/i18n';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';

import { useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { ApiRequestError, unwrap, useErrorText } from '@/lib/errors';
import { useSession } from '@/lib/session';

/** Только внутренние пути: защита от открытого редиректа через `?next=`. */
export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return null;
  return value === '/login' ? null : value;
}

function retryAfterSec(error: unknown): number | null {
  if (!(error instanceof ApiRequestError)) return null;
  const sec = (error.body.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec;
  return typeof sec === 'number' ? sec : null;
}

export function LoginForm() {
  const t = useTranslations('auth.login');
  const errorText = useErrorText();
  const api = useApi();
  const { status, login } = useSession();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status === 'authenticated') router.replace(next ?? '/org');
  }, [status, next, router]);

  useEffect(() => {
    if (resendAt <= now) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt, now]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const describe = (err: unknown) => {
    const sec = retryAfterSec(err);
    return sec !== null ? `${errorText(err)}. ${t('retryAfter', { sec })}` : errorText(err);
  };

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await unwrap(api.POST('/api/v1/auth/otp/request', { body: { phone } }));
      setResendAt(Date.now() + res.resendAfterSec * 1000);
      setNow(Date.now());
      setStep('code');
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const onPhoneSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isCompletePhone(phone)) {
      setInputError(t('invalidPhone'));
      return;
    }
    setInputError(null);
    void requestCode();
  };

  const onCodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setInputError(t('invalidCode'));
      return;
    }
    setInputError(null);
    setBusy(true);
    setError(null);
    const result = await login(phone, code);
    setBusy(false);
    if (!result.ok) {
      setError(describe(new ApiRequestError(result.status, result.error)));
      return;
    }
    router.replace(next ?? '/org', { locale: result.data.user.locale });
  };

  return (
    <div className="flex flex-col gap-6 rounded-control border border-border bg-surface p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-1 text-ink-muted">{t('subtitle')}</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}

      {step === 'phone' ? (
        <form onSubmit={onPhoneSubmit} noValidate className="flex flex-col gap-4">
          <PhoneInput
            label={t('phoneLabel')}
            value={phone}
            onChange={setPhone}
            error={inputError}
            required
            autoFocus
          />
          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {t('sendCode')}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void onCodeSubmit(e)} noValidate className="flex flex-col gap-4">
          <p className="text-ink" data-testid="code-sent">
            {t('codeSent', { phone: formatPhone(phone).replaceAll(' ', '\u00a0') })}
          </p>
          <Input
            label={t('codeLabel')}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            error={inputError}
            required
            autoFocus
            className="text-xl tracking-widest"
          />
          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {t('submit')}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {secondsLeft > 0 ? (
              <p className="text-sm text-ink-muted">{t('resendIn', { sec: secondsLeft })}</p>
            ) : (
              <Button variant="ghost" disabled={busy} onClick={() => void requestCode()}>
                {t('resend')}
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
                setInputError(null);
              }}
            >
              {t('changePhone')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
