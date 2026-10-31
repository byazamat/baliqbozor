import { ru, uz } from './generated/messages.js';

export const LOCALES = ['uz', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];

/** Узбекский (латиница) — язык по умолчанию (SPEC 12.1). */
export const DEFAULT_LOCALE: Locale = 'uz';

/** Часовой пояс отображения (SPEC 6.2). */
export const DISPLAY_TIME_ZONE = 'Asia/Tashkent';

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof uz>;

export const messages: Readonly<Record<Locale, Messages>> = { uz, ru };

type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Все ключи переводов в виде `module.section.key`. */
export type MessageKey = Paths<Messages>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
