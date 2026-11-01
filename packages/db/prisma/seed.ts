/**
 * Seed (SPEC 7.3): справочники и настройки 8.13 — всегда; демо-данные — только при
 * `APP_ENV=local|staging` (D-36). Повторный запуск ничего не дублирует.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { createPrismaClient } from '../src/client.js';
import {
  DEMO_ENVS,
  type PutObject,
  seedDemo,
  seedDemoCatalog,
  seedReference,
} from '../src/seed/index.js';

/** Картинки демо-наличия кладутся в бакет, если задан S3 (как у api и worker). */
function s3PutObject(): PutObject | null {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) return null;
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  return async (key, image) => {
    const body = await readFile(path.join(import.meta.dirname, '..', 'seed-assets', image));
    await s3.send(
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: 'image/jpeg' }),
    );
  };
}

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
      const catalog = await seedDemoCatalog(prisma, s3PutObject());
      process.stdout.write(
        `seed: demo ${String(catalog.farms)} farms, ${String(catalog.listings)} listings\n`,
      );
    } else {
      process.stdout.write(`seed: demo data skipped for APP_ENV=${appEnv}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
