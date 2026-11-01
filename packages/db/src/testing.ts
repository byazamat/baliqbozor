/**
 * Тестовая БД для e2e (api, worker): отдельная база `<имя>_test`, чтобы тесты не трогали
 * данные разработки. Создаётся и мигрируется в Jest globalSetup, очищается между тестами.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import pg from 'pg';

import type { PrismaClient } from './generated/prisma/client.js';

const DB_PACKAGE_DIR = path.resolve(import.meta.dirname, '..');

const REPO_ROOT = path.resolve(DB_PACKAGE_DIR, '../..');

/**
 * Окружение e2e: корневой `.env` (переменные CI имеют приоритет), тестовая БД `<имя>_test`,
 * отдельная база Redis,
 * `NODE_ENV=test`, логи выключены. Jest подменяет process.env копией для каждого файла,
 * поэтому значения присваиваются явно.
 */
export function loadTestEnv(scope: TestScope, env: NodeJS.ProcessEnv = process.env): void {
  const rootEnv = path.join(REPO_ROOT, '.env');
  if (existsSync(rootEnv)) {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, 'utf8')))) {
      env[key] ??= value;
    }
  }
  env.DATABASE_URL = testDatabaseUrl(env, scope);
  if (env.REDIS_URL) env.REDIS_URL = testRedisUrl(env.REDIS_URL, scope);
  env.NODE_ENV = 'test';
  env.LOG_LEVEL = 'silent';
}

/**
 * e2e api и worker идут параллельно, поэтому у каждого своя БД и своя база Redis — иначе
 * очистка в одном прогоне ломает другой (D-45).
 */
export type TestScope = 'api' | 'worker';
const REDIS_DB: Readonly<Record<TestScope, string>> = { api: '/1', worker: '/2' };

/** Отдельная база Redis для тестов, чтобы `flushdb` и очереди тестов не трогали разработку. */
export function testRedisUrl(redisUrl: string, scope: TestScope): string {
  const url = new URL(redisUrl);
  const db = url.pathname.replace(/^\//, '');
  if (db === '' || db === '0') url.pathname = REDIS_DB[scope];
  return url.toString();
}

/** `DATABASE_URL_TEST`, иначе `DATABASE_URL` с суффиксом `_test_<scope>` у имени базы. */
export function testDatabaseUrl(env: NodeJS.ProcessEnv, scope: TestScope): string {
  if (env.DATABASE_URL_TEST)
    return env.DATABASE_URL_TEST.replace(/(\/[^/?]+)(\?|$)/, `$1_${scope}$2`);
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const url = new URL(env.DATABASE_URL);
  const name = url.pathname.replace(/^\//, '');
  if (!name) throw new Error('DATABASE_URL has no database name');
  if (!/_test(_\w+)?$/.test(name)) url.pathname = `/${name}_test_${scope}`;
  return url.toString();
}

/** Создаёт базу, если её нет, и применяет миграции (`prisma migrate deploy`). */
export async function prepareTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/^[\w-]+$/.test(name)) throw new Error(`Unsafe test database name: ${name}`);
  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      try {
        await client.query(`CREATE DATABASE "${name}"`);
      } catch (err) {
        // api и worker готовят базу параллельно: «уже существует» — не ошибка.
        const code = (err as { code?: string }).code;
        if (code !== '42P04' && code !== '23505') throw err;
      }
    }
  } finally {
    await client.end();
  }
  execFileSync(path.join(DB_PACKAGE_DIR, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: DB_PACKAGE_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

/** Очищает все таблицы приложения (кроме истории миграций). Только для тестовых баз. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  const db = rows[0]?.db ?? '';
  if (!/_test(_\w+)?$/.test(db)) throw new Error(`Refusing to truncate non-test database ${db}`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename.replace(/"/g, '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
