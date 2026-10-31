import { existsSync } from 'node:fs';
import path from 'node:path';

/** Локально читает корневой `.env`; в staging/production переменные задаёт окружение. */
const rootEnv = path.resolve(import.meta.dirname, '../../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
