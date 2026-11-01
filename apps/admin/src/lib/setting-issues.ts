'use client';

import type { SettingIssue } from '@baliqbozor/domain';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

const TYPE_NAMES = ['number', 'string', 'boolean', 'object'] as const;
type TypeName = (typeof TYPE_NAMES)[number];
const isTypeName = (value: string): value is TypeName =>
  (TYPE_NAMES as readonly string[]).includes(value);

/** Проблемы значения настройки (коды домена) → текст на языке интерфейса (D-50). */
export function useSettingIssuesText(): (issues: readonly SettingIssue[]) => string {
  const t = useTranslations('admin.settings');
  return useCallback(
    (issues: readonly SettingIssue[]) => {
      const text = (issue: SettingIssue): string => {
        switch (issue.code) {
          case 'max':
            return t('issue.max', { max: issue.max });
          case 'min':
            return t('issue.min', { min: issue.min });
          case 'integer':
            return t('issue.integer');
          case 'type':
            return t('issue.type', {
              type: isTypeName(issue.expected) ? t(`typeName.${issue.expected}`) : issue.expected,
            });
          case 'oneOf':
            return t('issue.oneOf', { values: issue.values.join(', ') });
          case 'format':
            return t('issue.format');
          case 'unknownKeys':
            return t('issue.unknownKeys', { keys: issue.keys.join(', ') });
          case 'rule':
            return t(`issue.${issue.rule}`);
          default:
            return t('issue.invalid');
        }
      };
      return issues
        .map((issue) =>
          issue.path ? t('issue.field', { field: issue.path, text: text(issue) }) : text(issue),
        )
        .join('; ');
    },
    [t],
  );
}
