import type { Locale } from '@baliqbozor/i18n';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { LoginForm } from './login-form';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/login'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: 'auth.login' });
  return { title: t('title') };
}

export default async function LoginPage({ params }: PageProps<'/[locale]/login'>) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
