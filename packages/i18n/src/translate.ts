import { type Locale, type MessageKey, messages } from './locales.js';

export type TranslateParams = Readonly<Record<string, string | number>>;

/**
 * Простой перевод по ключу для серверного кода (уведомления, PDF).
 * Плейсхолдеры в формате `{name}` — тот же синтаксис, что у next-intl и i18next в клиентах.
 */
export function translate(locale: Locale, key: MessageKey, params: TranslateParams = {}): string {
  let node: unknown = messages[locale];
  for (const part of key.split('.')) {
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[part]
        : undefined;
  }
  if (typeof node !== 'string') return key;
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
