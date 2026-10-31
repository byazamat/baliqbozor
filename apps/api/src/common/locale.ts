import { DEFAULT_LOCALE, isLocale, type Locale } from '@baliqbozor/i18n';

/** Язык ответа из `Accept-Language` (`ru`, `ru-RU`, `uz;q=0.9` …); по умолчанию uz. */
export function localeFromHeader(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}
