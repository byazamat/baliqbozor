import type { IncomingMessage } from 'node:http';

import { maskPhonesDeep, maskPhonesInText } from '@baliqbozor/domain';
import type { Params } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import type { AuthContext } from './request-context.js';
import { genRequestId } from './request-id.js';

function safeDecode(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

/** `userId`/`orgId` для строки лога запроса, если запрос аутентифицирован. */
export function authLogProps(req: IncomingMessage): Record<string, string> {
  const auth = (req as IncomingMessage & { auth?: AuthContext }).auth;
  if (!auth) return {};
  return { userId: auth.userId, ...(auth.org ? { orgId: auth.org.id } : {}) };
}

const QUIET_PATHS = new Set(['/health', '/ready']);

/** pino: JSON, requestId, без тел запросов, телефоны маскируются (SPEC 13.3). */
export function loggerParams(env: Env): Params {
  const pretty = env.APP_ENV === 'local' && env.NODE_ENV === 'development';
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: genRequestId,
      // Пользователь и организация из guard'а аутентификации (SPEC 13.3); ставятся к концу запроса.
      customProps: (req: IncomingMessage) => authLogProps(req),
      autoLogging: { ignore: (req: IncomingMessage) => QUIET_PATHS.has(req.url ?? '') },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: maskPhonesInText(safeDecode(req.url)),
        }),
        // Только статус: заголовки ответа в логах не нужны.
        res: (res: { statusCode: number | null }) => ({ statusCode: res.statusCode }),
      },
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
