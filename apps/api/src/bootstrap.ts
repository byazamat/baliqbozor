import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { jsonReplacer } from './common/json-replacer.js';
import { requestContextMiddleware } from './common/request-context.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';
import { createOpenApiDocument } from './openapi/document.js';

export const API_PREFIX = 'api/v1';

/** Общая настройка приложения для main.ts, e2e-тестов и экспорта OpenAPI. */
export function configureApp(app: NestExpressApplication, env: Env): NestExpressApplication {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'ready'] });
  app.set('json replacer', jsonReplacer);
  if (env.TRUST_PROXY_HOPS > 0) app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(requestContextMiddleware);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: env.APP_ENV === 'production' ? undefined : false }));
  app.enableCors({ origin: [env.WEB_URL, env.ADMIN_URL], credentials: true });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  if (env.APP_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, () => createOpenApiDocument(app, env));
  }
  return app;
}

export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
  });
  return configureApp(app, env);
}
