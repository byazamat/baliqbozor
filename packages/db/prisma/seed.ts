/**
 * Seed (SPEC 7.3). Справочники, настройки 8.13 и демо-данные появятся в M1 вместе со схемой.
 */
import { createPrismaClient } from '../src/client.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const prisma = createPrismaClient({ connectionString });
  try {
    await prisma.$queryRaw`SELECT 1`;
    process.stdout.write('seed: database reachable, nothing to seed yet (M0)\n');
  } finally {
    await prisma.$disconnect();
  }
}

await main();
