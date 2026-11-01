/**
 * Seed (SPEC 7.3): справочники и настройки 8.13 — всегда; демо-данные — только при
 * `APP_ENV=local|staging` (D-36). Повторный запуск ничего не дублирует.
 */
import { createPrismaClient } from '../src/client.js';
import { DEMO_ENVS, seedDemo, seedReference } from '../src/seed/index.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const appEnv = process.env.APP_ENV ?? 'local';

  const prisma = createPrismaClient({ connectionString });
  try {
    const ref = await seedReference(prisma);
    process.stdout.write(
      `seed: ${String(ref.regions)} regions, ${String(ref.species)} species, ` +
        `${String(ref.sizeClasses)} size classes, ${String(ref.settingsCreated)} new settings\n`,
    );
    if ((DEMO_ENVS as readonly string[]).includes(appEnv)) {
      const demo = await seedDemo(prisma);
      process.stdout.write(
        `seed: demo ${String(demo.users)} users, ${String(demo.orgs)} organizations ` +
          `(+998900000001 operator, +998900000002 admin)\n`,
      );
    } else {
      process.stdout.write(`seed: demo data skipped for APP_ENV=${appEnv}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
