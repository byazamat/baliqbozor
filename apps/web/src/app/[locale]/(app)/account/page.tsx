'use client';

import { formatPhone, LOCALES, type Locale } from '@baliqbozor/i18n';
import { Alert, type AlertTone, Button, Input, Select } from '@baliqbozor/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

import { Page, Section } from '@/components/page';
import { VerificationBadge } from '@/components/status-badge';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useApi } from '@/lib/api';
import { unwrap, useErrorText } from '@/lib/errors';
import { ME_QUERY_KEY, useSession } from '@/lib/session';

/** Профиль пользователя (SPEC 10.3 `PATCH /me`): имя и язык интерфейса. */
export default function AccountPage() {
  const t = useTranslations('web.account');
  const tc = useTranslations('common');
  const tOrg = useTranslations('org');
  const tNav = useTranslations('web.nav');
  const errorText = useErrorText();
  const api = useApi();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const { me, selectOrg } = useSession();

  const [fullName, setFullName] = useState(me?.fullName ?? '');
  const [locale, setLocale] = useState<Locale>(me?.locale ?? currentLocale);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: AlertTone; text: string } | null>(null);

  if (!me) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await unwrap(
        api.PATCH('/api/v1/me', {
          body: { locale, ...(fullName.trim() ? { fullName: fullName.trim() } : {}) },
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      setMessage({ tone: 'success', text: tc('saved') });
      if (locale !== currentLocale) router.replace(pathname, { locale });
    } catch (err) {
      setMessage({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title={t('title')}>
      <Section>
        <form onSubmit={(e) => void save(e)} noValidate className="flex max-w-lg flex-col gap-4">
          <Input
            label={t('fullName')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={120}
            autoComplete="name"
          />
          <Input
            label={t('phone')}
            value={formatPhone(me.phone)}
            hint={t('phoneHint')}
            readOnly
            disabled
          />
          <Select
            label={t('language')}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            options={LOCALES.map((l) => ({ value: l, label: tc(`languages.${l}`) }))}
          />
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
          <Button type="submit" disabled={busy} className="self-start">
            {tc('save')}
          </Button>
        </form>
      </Section>
      <Section title={t('organizations')}>
        <ul className="flex flex-col divide-y divide-border">
          {me.organizations.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-ink">{o.name}</p>
                <p className="text-ink-muted">{`${tOrg(`type.${o.type}`)} · ${tOrg(`role.${o.role}`)}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <VerificationBadge status={o.verificationStatus} />
                <Button
                  variant="ghost"
                  onClick={() => {
                    selectOrg(o.id);
                    router.push('/org');
                  }}
                >
                  {tc('open')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button variant="secondary" className="mt-4" onClick={() => router.push('/onboarding')}>
          {tNav('newOrg')}
        </Button>
      </Section>
    </Page>
  );
}
