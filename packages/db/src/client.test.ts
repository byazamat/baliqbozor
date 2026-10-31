import { describe, expect, it } from 'vitest';

import { createPrismaClient } from './index.js';

describe('createPrismaClient', () => {
  it('creates a client without connecting', async () => {
    const client = createPrismaClient({ connectionString: 'postgresql://u:p@localhost:1/db' });
    expect(typeof client.$queryRaw).toBe('function');
    await client.$disconnect();
  });
});
