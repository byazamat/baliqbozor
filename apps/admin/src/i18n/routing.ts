import { DEFAULT_LOCALE, LOCALES } from '@baliqbozor/i18n';
import { defineRouting } from 'next-intl/routing';

/** uz — без префикса, ru — `/ru/…`; как в web (D-24). */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'as-needed',
});
