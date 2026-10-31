import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import type { Env } from './config/env.js';
import { WorkerModule } from './worker.module.js';

export async function createWorker(env: Env): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  return app;
}
