export { createPrismaClient, type CreatePrismaClientOptions } from './client.js';
export { Prisma, PrismaClient } from './generated/prisma/client.js';
export * from './generated/prisma/enums.js';
export type * from './generated/prisma/models.js';

import type { Prisma } from './generated/prisma/client.js';

/** Клиент внутри `prisma.$transaction(async (tx) => …)` — передаётся в сервисы, аудит и outbox. */
export type TransactionClient = Prisma.TransactionClient;
