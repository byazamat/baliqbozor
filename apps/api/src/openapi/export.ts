/**
 * Экспорт OpenAPI без БД и сети (`pnpm api:generate`): модули Nest создаются,
 * но подключения ленивые и не открываются.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '../app.module.js';
import { API_PREFIX } from '../bootstrap.js';
import { loadEnv } from '../config/env.js';
import { createOpenApiDocument, stableStringify } from './document.js';

const target = process.argv[2];
if (!target) throw new Error('Usage: node dist/openapi/export.js <output.json>');

const env = loadEnv({
  NODE_ENV: 'production',
  APP_ENV: 'local',
  API_URL: 'http://localhost:4000',
  WEB_URL: 'http://localhost:3000',
  ADMIN_URL: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:1/openapi',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'openapi',
  S3_ACCESS_KEY: 'openapi',
  S3_SECRET_KEY: 'openapi',
  LOG_LEVEL: 'silent',
});

const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
  logger: false,
});
app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'ready'] });
const document = createOpenApiDocument(app, env);
await app.close();

const output = path.resolve(process.cwd(), target);
writeFileSync(output, stableStringify(document));
process.stdout.write(`OpenAPI written to ${output}\n`);
