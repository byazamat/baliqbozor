import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

// Jest подменяет process.env копией для каждого файла, а process.loadEnvFile пишет в настоящий
// объект окружения, поэтому значения .env присваиваются явно (переменные CI имеют приоритет).
const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, 'utf8')))) {
    process.env[key] ??= value;
  }
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
