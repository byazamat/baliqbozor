import type { IncomingMessage } from 'node:http';

import { maskPhonesInText } from '@baliqbozor/domain';
import type { Params } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import { genRequestId } from './request-id.js';

function maskDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return maskPhonesInText(value);
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return value;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskDeep(v, depth + 1)]),
  );
}

function safeDecode(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

const QUIET_PATHS = new Set(['/health', '/ready']);

/** pino: JSON, requestId, без тел запросов, телефоны маскируются (SPEC 13.3). */
export function loggerParams(env: Env): Params {
  const pretty = env.APP_ENV === 'local' && env.NODE_ENV === 'development';
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: genRequestId,
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
      },
      formatters: {
        log: (object: Record<string, unknown>) => maskDeep(object) as Record<string, unknown>,
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
