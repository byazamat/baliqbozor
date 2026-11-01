'use client';

import { LOCALES } from '@baliqbozor/i18n';
import { cn } from '@baliqbozor/ui';
import { useLocale, useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';

export function LanguageSwitcher() {
  const t = useTranslations('common');
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t('language')}>
      <ul className="flex gap-1">
        {LOCALES.map((locale) => (
          <li key={locale}>
            <Link
              href={pathname}
              locale={locale}
              lang={locale}
              aria-current={locale === current ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-control px-2 font-medium sm:px-3',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                locale === current ? 'bg-brand-700 text-white' : 'text-brand-700 hover:bg-brand-50',
              )}
            >
              {t(`languages.${locale}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
