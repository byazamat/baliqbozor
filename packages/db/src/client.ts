import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  connectionString: string;
}

/** Клиент Prisma 7 с driver adapter `@prisma/adapter-pg` (DECISIONS D-03). */
export function createPrismaClient({ connectionString }: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
