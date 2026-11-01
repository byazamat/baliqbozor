/** `pnpm admin:grant <phone> <OPERATOR|ADMIN|USER>` — выдача платформенной роли (D-36). */
import { existsSync } from 'node:fs';
import path from 'node:path';

import { createPrismaClient } from '../src/client.js';
import { GRANTABLE_ROLES, grantPlatformRole } from '../src/seed/index.js';

const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const [phone, role] = process.argv.slice(2).filter((a) => a !== '--');
if (!phone || !role) {
  process.stderr.write(`Usage: pnpm admin:grant <phone> <${GRANTABLE_ROLES.join('|')}>\n`);
  process.exit(2);
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const prisma = createPrismaClient({ connectionString });
try {
  const res = await grantPlatformRole(prisma, phone, role);
  process.stdout.write(
    `admin:grant: ${res.phone} ${res.before ?? '(new user)'} → ${res.after}${
      res.created ? ' (user will finish sign-up on first login)' : ''
    }\n`,
  );
} catch (err) {
  process.stderr.write(`admin:grant failed: ${(err as Error).message}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
