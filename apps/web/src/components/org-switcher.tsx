'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { useSession } from '@/lib/session';

/** Переключатель организаций: выбранная уходит в `X-Org-Id` запросов уровня организации. */
export function OrgSwitcher() {
  const t = useTranslations('web.nav');
  const tType = useTranslations('org.type');
  const { me, currentOrg, selectOrg } = useSession();
  const id = useId();
  const orgs = me?.organizations ?? [];
  if (!currentOrg || orgs.length < 2) {
    return currentOrg ? (
      <span className="truncate font-medium text-ink" data-testid="current-org">
        {currentOrg.name}
      </span>
    ) : null;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t('currentOrg')}
      </label>
      <select
        id={id}
        data-testid="org-switcher"
        value={currentOrg.id}
        onChange={(e) => selectOrg(e.target.value)}
        className="min-h-11 max-w-64 truncate rounded-control border border-border-strong bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {`${o.name} · ${tType(o.type)}`}
          </option>
        ))}
      </select>
    </div>
  );
}
