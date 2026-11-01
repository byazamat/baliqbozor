'use client';

import { Alert } from '@baliqbozor/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { useCurrentOrg } from '@/lib/session';

import { Page } from './page';

/** Разделы продавца: другим типам организаций — понятное сообщение вместо пустой страницы. */
export function SellerOnly({ title, children }: { title: string; children: ReactNode }) {
  const te = useTranslations('errors');
  const org = useCurrentOrg();
  if (org.type !== 'SELLER') {
    return (
      <Page title={title}>
        <Alert tone="info">{te('FORBIDDEN')}</Alert>
      </Page>
    );
  }
  return children;
}
