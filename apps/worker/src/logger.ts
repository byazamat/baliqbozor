import { maskPhonesDeep, maskPhonesInText } from '@baliqbozor/domain';
import type { Params } from 'nestjs-pino';

import type { Env } from './config/env.js';

/** pino для worker: JSON, без персональных данных, телефоны маскируются (SPEC 13.3). */
export function loggerParams(env: Env): Params {
  const pretty = env.APP_ENV === 'local' && env.NODE_ENV === 'development';
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      base: { service: 'worker' },
      formatters: {
        log: (object: Record<string, unknown>) => maskPhonesDeep(object) as Record<string, unknown>,
      },
      hooks: {
        logMethod(args, method) {
          method.apply(
            this,
            args.map((a: unknown) =>
              typeof a === 'string' ? maskPhonesInText(a) : a,
            ) as Parameters<typeof method>,
          );
        },
      },
      ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
    },
  };
}
