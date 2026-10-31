import type { Messages } from '@baliqbozor/i18n';
import 'i18next';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Messages };
  }
}
