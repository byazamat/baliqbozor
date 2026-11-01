import { describe, expect, it } from 'vitest';

import { createPrismaClient } from './index.js';

describe('createPrismaClient', () => {
  it('creates a client without connecting', async () => {
    const client = createPrismaClient({ connectionString: 'postgresql://u:p@localhost:1/db' });
    expect(typeof client.$queryRaw).toBe('function');
    await client.$disconnect();
  });
});

describe('exports', () => {
  it('re-exports schema enums used by domain rules', async () => {
    const db = await import('./index.js');
    expect(db.VerificationStatus).toEqual({
      UNVERIFIED: 'UNVERIFIED',
      PENDING: 'PENDING',
      VERIFIED: 'VERIFIED',
      REJECTED: 'REJECTED',
      SUSPENDED: 'SUSPENDED',
    });
    expect(Object.keys(db.MemberRole)).toEqual(['OWNER', 'MANAGER', 'STAFF']);
    expect(Object.keys(db.OrgType)).toEqual(['SELLER', 'BUYER', 'CARRIER']);
  });
});
