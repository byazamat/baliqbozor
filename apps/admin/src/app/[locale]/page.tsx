import type { Locale } from '@baliqbozor/i18n';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';

import { HealthStatus } from '@/components/health-status';

export default function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = use(params);
  // Неизвестная локаль уже отсечена notFound() в layout.
  setRequestLocale(locale as Locale);
  const t = useTranslations('admin.home');

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold text-ink">{t('title')}</h1>
      <p className="mt-2 text-lg text-ink-muted">{t('subtitle')}</p>
      <div className="mt-8 max-w-md">
        <HealthStatus />
      </div>
    </main>
  );
}
