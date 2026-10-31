import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, isLocale, LOCALES, type MessageKey, messages } from './locales.js';
import { translate } from './translate.js';

describe('locales', () => {
  it('defaults to uz and supports ru', () => {
    expect(DEFAULT_LOCALE).toBe('uz');
    expect(LOCALES).toEqual(['uz', 'ru']);
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('en')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(messages.ru.common.currency).toBe('сум');
  });
});

describe('translate', () => {
  it('resolves nested keys', () => {
    expect(translate('ru', 'errors.NOT_FOUND')).toBe('Не найдено');
    expect(translate('uz', 'health.ok')).toBe('Ishlayapti');
  });

  it('interpolates params and keeps unknown placeholders', () => {
    expect(translate('ru', 'health.version', { version: '1.2' })).toBe('Версия: 1.2');
    expect(translate('uz', 'health.version')).toBe('Versiya: {version}');
  });

  it('falls back to the key for unknown or non-leaf paths', () => {
    expect(translate('ru', 'common.nope' as MessageKey)).toBe('common.nope');
    expect(translate('ru', 'common.languages' as MessageKey)).toBe('common.languages');
    expect(translate('ru', 'common.tagline.deeper' as MessageKey)).toBe('common.tagline.deeper');
  });
});
