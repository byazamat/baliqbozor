import './config/load-env-file.js';

import * as Sentry from '@sentry/nestjs';

/** Sentry включается только при заданном `SENTRY_DSN_API`. Импортируется первым в main.ts. */
const dsn = process.env.SENTRY_DSN_API?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? 'local',
    tracesSampleRate: 0.1,
  });
}
