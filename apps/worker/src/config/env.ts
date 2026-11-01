import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v : undefined));

/** Переменные окружения worker (SPEC 13.6 + D-05, D-10). Проверяются при старте. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(0).max(65535).default(4010),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  /** Адрес веба для ссылок в SMS и уведомлениях (D-10). */
  WEB_URL: z.url().default('http://localhost:3000'),
  BRAND_NAME: z.string().min(1).default('BaliqBozor'),
  /** Хранилище файлов: worker читает загрузки и пишет обработанные копии (D-52). */
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Свой ffmpeg вместо бинарника из `ffmpeg-static` (например, системный в Docker-образе). */
  FFMPEG_PATH: optionalString,
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
