import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { ApiErrorDto } from '../common/api-error.dto.js';
import type { Env } from '../config/env.js';

export const API_VERSION = '0.1.0';

export function createOpenApiDocument(
  app: INestApplication,
  env: Pick<Env, 'BRAND_NAME'>,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(`${env.BRAND_NAME} API`)
    .setVersion(API_VERSION)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorDto],
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

/** Стабильный порядок ключей — чтобы дрейф OpenAPI в CI ловил только смысловые изменения. */
export function stableStringify(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
