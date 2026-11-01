import type { Locale } from '@baliqbozor/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { CatalogView } from './catalog-view';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/catalog'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'web.catalog' });
  return { title: t('title'), description: t('subtitle') };
}

export default async function CatalogPage({ params }: PageProps<'/[locale]/catalog'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: 'web.catalog' });
  return (
    <main id="main" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('title')}</h1>
        <p className="mt-1 text-ink-muted">{t('subtitle')}</p>
      </div>
      <CatalogView />
    </main>
  );
}
