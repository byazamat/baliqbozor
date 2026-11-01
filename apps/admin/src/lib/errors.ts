import { errorCode } from '@baliqbozor/api-client';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

export {
  ApiRequestError,
  clientError,
  errorCode,
  invalidFields,
  unwrap,
} from '@baliqbozor/api-client';

/** Текст ошибки для пользователя по `error.code` (`errors.<CODE>`). */
export function useErrorText(): (error: unknown) => string {
  const t = useTranslations('errors');
  return useCallback((error: unknown) => t(errorCode(error)), [t]);
}
