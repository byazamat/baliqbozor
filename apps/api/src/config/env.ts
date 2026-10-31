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
export const envSchema = z.object({
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SENTRY_DSN_API: optionalString,
  BRAND_NAME: z.string().min(1).default('BaliqBozor'),
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
