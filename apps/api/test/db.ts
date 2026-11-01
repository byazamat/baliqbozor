import { truncateAll } from '@baliqbozor/db/testing';
import type { INestApplication } from '@nestjs/common';

import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';

/** Чистая тестовая БД и пустой Redis-кэш перед тестом. */
export async function resetState(app: INestApplication): Promise<void> {
  await truncateAll(app.get(PrismaService).client);
  const redis = await app.get(RedisService).ready();
  await redis.flushdb();
}

export const prismaOf = (app: INestApplication) => app.get(PrismaService).client;
