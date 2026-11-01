import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v : undefined));

const booleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

/** Переменные окружения API (SPEC 13.6 + DECISIONS D-10). Проверяются при старте. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_URL: z.url(),
    WEB_URL: z.url(),
    ADMIN_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_PUBLIC_ENDPOINT: optionalString,
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanString,
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SENTRY_DSN_API: optionalString,
    BRAND_NAME: z.string().min(1).default('BaliqBozor'),
    /** Лимит запросов на пользователя (или IP до входа) в минуту, SPEC 10.1; 0 — выключен. */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(100),
    /** Сколько reverse proxy перед API: от этого зависит реальный IP клиента (`trust proxy`). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    /** Подпись access JWT (HS256, SPEC 13.2); PREVIOUS — старый ключ на время ротации (D-10). */
    JWT_ACCESS_SECRET: z.string().min(8),
    JWT_ACCESS_SECRET_PREVIOUS: optionalString,
    JWT_ACCESS_TTL: z.coerce.number().int().min(60).max(86_400).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    /** Код-обход OTP — только при APP_ENV=local (CLAUDE.md). */
    OTP_DEV_BYPASS_CODE: optionalString,
    /** Провайдер SMS: в M1 только console; eskiz — M8 (D-41). */
    SMS_PROVIDER: z.enum(['console']).default('console'),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV === 'local') return;
    const weak = (s: string | undefined) => !s || s.length < 32 || s === 'change-me';
    if (weak(env.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Use a random secret of at least 32 characters outside local',
      });
    }
    if (env.OTP_DEV_BYPASS_CODE) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DEV_BYPASS_CODE'],
        message: 'OTP bypass is allowed only when APP_ENV=local',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** DI-токен проверенной конфигурации. */
export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
  }
  return result.data;
}
