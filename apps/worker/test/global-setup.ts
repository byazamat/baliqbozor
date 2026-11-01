import { loadTestEnv, prepareTestDatabase } from '@baliqbozor/db/testing';

/** Один раз перед e2e: создать тестовую БД, если её нет, и применить миграции. */
export default async function globalSetup(): Promise<void> {
  loadTestEnv('worker');
  await prepareTestDatabase(process.env.DATABASE_URL ?? '');
}
