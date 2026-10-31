import '../globals.css';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LanguageSwitcher } from '@/components/language-switcher';
import { routing } from '@/i18n/routing';

import { Providers } from '../providers';

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'BaliqBozor';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'admin.home' });
  const title = `${t('title')} · ${BRAND}`;
  // Админка не индексируется поисковиками.
  return { title, robots: { index: false, follow: false } };
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <Providers>
            <header className="border-b border-border bg-surface">
              <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
                <span className="text-xl font-bold text-brand-700">{BRAND}</span>
                <LanguageSwitcher />
              </div>
            </header>
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
