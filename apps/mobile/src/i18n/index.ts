import { DEFAULT_LOCALE, LOCALES, type Locale, messages } from '@baliqbozor/i18n';
import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

/** i18next с ключами из `packages/i18n` (D-08); плейсхолдеры `{name}`, как в next-intl. */
export function createI18n(locale: Locale = DEFAULT_LOCALE): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    resources: Object.fromEntries(LOCALES.map((l) => [l, { translation: messages[l] }])),
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
    initAsync: false,
    returnNull: false,
  });
  return instance;
}
