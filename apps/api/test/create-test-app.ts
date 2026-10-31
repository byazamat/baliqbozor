import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { type Env, loadEnv } from '../src/config/env.js';

export interface TestAppOptions {
  env?: Partial<Env>;
  overrides?: ReadonlyArray<{ token: unknown; value: unknown }>;
  extraModules?: Type[];
}

/** Поднимает приложение так же, как main.ts, но без прослушивания порта. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const env: Env = { ...loadEnv(process.env), ...options.env };
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(env), ...(options.extraModules ?? [])],
  });
  for (const { token, value } of options.overrides ?? []) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app, env);
  await app.init();
  return app;
}
