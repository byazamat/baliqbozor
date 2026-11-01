import { parseSetting, type SettingIssue } from '@baliqbozor/domain';
import { messages } from '@baliqbozor/i18n';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { useSettingIssuesText } from './setting-issues';

function format(locale: 'uz' | 'ru', issues: SettingIssue[]) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {children}
    </NextIntlClientProvider>
  );
  return renderHook(() => useSettingIssuesText(), { wrapper }).result.current(issues);
}

const issuesOf = (...args: Parameters<typeof parseSetting>) => {
  const res = parseSetting(...args);
  return res.ok ? [] : res.issues;
};

describe('useSettingIssuesText', () => {
  it('translates domain issues to Russian', () => {
    expect(format('ru', issuesOf('commission.defaultRateBps', 20_000))).toBe('Не больше 10000');
    expect(format('ru', issuesOf('commission.defaultRateBps', -1))).toBe('Не меньше 0');
    expect(format('ru', issuesOf('commission.defaultRateBps', 1.5))).toBe('Нужно целое число');
    expect(format('ru', issuesOf('commission.defaultRateBps', Number.NaN))).toBe(
      'Ожидается: число',
    );
    expect(format('ru', issuesOf('commission.billingPeriod', 'DAY'))).toBe(
      'Допустимые значения: WEEK, MONTH',
    );
    expect(format('ru', issuesOf('ops.workingHours', { from: '8:00', to: '20:00' }))).toBe(
      'from: Время в формате ЧЧ:ММ, например 08:00; Начало должно быть раньше окончания',
    );
    expect(
      format(
        'ru',
        issuesOf('matching.weights', {
          distance: 0.5,
          price: 0.6,
          reliability: 0,
          freshness: 0,
          volume: 0,
        }),
      ),
    ).toBe('Сумма весов должна быть равна 1');
    expect(format('ru', [{ code: 'unknownKeys', keys: ['x', 'y'] }, { code: 'invalid' }])).toBe(
      'Лишние поля: x, y; Неверное значение',
    );
    expect(format('ru', [{ code: 'type', expected: 'bigint' }])).toBe('Ожидается: bigint');
  });

  it('translates to Uzbek', () => {
    expect(format('uz', issuesOf('order.requireVetDocument', 'yes'))).toBe(
      "Kutilgan qiymat: ha yoki yo'q",
    );
    expect(format('uz', issuesOf('ops.workingHours', { from: '21:00', to: '20:00' }))).toBe(
      "Boshlanish vaqti tugash vaqtidan oldin bo'lishi kerak",
    );
  });
});
