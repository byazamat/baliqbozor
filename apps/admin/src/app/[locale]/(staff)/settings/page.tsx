'use client';

import type { components } from '@baliqbozor/api-client';
import { isSettingKey, parseSetting, type SettingKey } from '@baliqbozor/domain';
import { formatDateTime } from '@baliqbozor/i18n';
import { Alert, type AlertTone, Badge, Button, cn } from '@baliqbozor/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Loading, Page } from '@/components/page';
import { useApi } from '@/lib/api';
import { ApiRequestError, unwrap, useErrorText } from '@/lib/errors';
import { useSession } from '@/lib/session';
import { settingFromText, settingToText } from '@/lib/settings';

type Setting = components['schemas']['SettingDto'];
const SETTINGS_KEY = ['admin', 'settings'] as const;

/** Настройки платформы 8.13 (SPEC 12.3, только ADMIN): таблица с описаниями и проверкой. */
export default function SettingsPage() {
  const t = useTranslations('admin.settings');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const { isAdmin } = useSession();
  const api = useApi();
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => unwrap(api.GET('/api/v1/admin/settings')),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <Page title={t('title')}>
        <Alert tone="warning">{t('onlyAdmin')}</Alert>
      </Page>
    );
  }
  if (query.isPending) return <Loading label={tc('loading')} />;
  if (query.isError) {
    return (
      <Page title={t('title')}>
        <Alert
          tone="danger"
          action={<Button onClick={() => void query.refetch()}>{tc('retry')}</Button>}
        >
          {errorText(query.error)}
        </Alert>
      </Page>
    );
  }

  return (
    <Page title={t('title')}>
      <div className="overflow-x-auto rounded-control border border-border bg-surface">
        <table className="w-full min-w-[48rem] table-fixed text-left" data-testid="settings-table">
          <caption className="sr-only">{t('caption')}</caption>
          <thead className="border-b border-border bg-surface-muted text-sm text-ink-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('key')}
              </th>
              <th scope="col" className="w-80 px-4 py-3 font-medium">
                {t('value')}
              </th>
              <th scope="col" className="w-48 px-4 py-3 font-medium">
                {t('default')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {query.data.items
              .filter((s) => isSettingKey(s.key))
              .map((s) => (
                <SettingRow key={s.key} setting={s} />
              ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}

function SettingRow({ setting }: { setting: Setting }) {
  const t = useTranslations('admin.settings');
  const tc = useTranslations('common');
  const errorText = useErrorText();
  const api = useApi();
  const queryClient = useQueryClient();
  const key = setting.key as SettingKey;
  const [text, setText] = useState(() => settingToText(setting.value));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: AlertTone; text: string } | null>(null);
  const dirty = text !== settingToText(setting.value);
  const inputId = `setting-${key}`;
  const messageId = `${inputId}-message`;
  const isObject = typeof setting.defaultValue === 'object';

  const save = async () => {
    const value = settingFromText(text, setting.defaultValue);
    if (value === undefined) {
      setMessage({ tone: 'danger', text: t('invalidJson') });
      return;
    }
    // Та же схема, что на сервере (domain/settings): ошибка видна сразу, без запроса.
    const parsed = parseSetting(key, value);
    if (!parsed.ok) {
      setMessage({ tone: 'danger', text: t('invalid', { issues: parsed.issues.join('; ') }) });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const updated = await unwrap(
        api.PATCH('/api/v1/admin/settings', {
          body: { key, value: parsed.value },
        }),
      );
      queryClient.setQueryData<components['schemas']['SettingsListDto']>(SETTINGS_KEY, (old) =>
        old ? { items: old.items.map((i) => (i.key === key ? updated : i)) } : old,
      );
      setText(settingToText(updated.value));
      setMessage({ tone: 'success', text: t('saved', { key }) });
    } catch (err) {
      const issues =
        err instanceof ApiRequestError
          ? (err.body.details as { issues?: string[] } | undefined)?.issues
          : undefined;
      setMessage({
        tone: 'danger',
        text: issues ? t('invalid', { issues: issues.join('; ') }) : errorText(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-mono text-sm text-ink">{key}</p>
        <p className="mt-1 text-sm text-ink-muted">{t(`desc.${key}`)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {setting.changed && <Badge tone="info">{t('changed')}</Badge>}
          {setting.updatedAt && (
            <span className="text-xs text-ink-muted">{formatDateTime(setting.updatedAt)}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            {t('editLabel', { key })}
          </label>
          {typeof setting.defaultValue === 'boolean' ? (
            <select
              id={inputId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={fieldClass(message?.tone === 'danger')}
            >
              <option value="true">{t('on')}</option>
              <option value="false">{t('off')}</option>
            </select>
          ) : isObject ? (
            <textarea
              id={inputId}
              value={text}
              rows={2}
              onChange={(e) => setText(e.target.value)}
              aria-describedby={messageId}
              className={cn(fieldClass(message?.tone === 'danger'), 'py-2 font-mono text-sm')}
            />
          ) : (
            <input
              id={inputId}
              value={text}
              inputMode={typeof setting.defaultValue === 'number' ? 'decimal' : undefined}
              onChange={(e) => setText(e.target.value)}
              aria-describedby={messageId}
              aria-invalid={message?.tone === 'danger' ? true : undefined}
              className={fieldClass(message?.tone === 'danger')}
            />
          )}
          {isObject && <p className="text-xs text-ink-muted">{t('jsonHint')}</p>}
          <div id={messageId} aria-live="polite">
            {message && (
              <p
                className={cn(
                  'text-sm font-medium',
                  message.tone === 'danger' ? 'text-danger-700' : 'text-status-success-fg',
                )}
              >
                {message.text}
              </p>
            )}
          </div>
          {dirty && (
            <Button type="submit" disabled={busy} className="self-start">
              {tc('save')}
            </Button>
          )}
        </form>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-ink-muted">
        {settingToText(setting.defaultValue)}
      </td>
    </tr>
  );
}

const fieldClass = (invalid: boolean) =>
  cn(
    'min-h-11 w-full rounded-control border bg-surface px-3 text-ink',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
    invalid ? 'border-danger-600' : 'border-border-strong',
  );
