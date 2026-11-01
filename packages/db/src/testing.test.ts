import { describe, expect, it } from 'vitest';

import { testDatabaseUrl, testRedisUrl } from './testing.js';

describe('testDatabaseUrl', () => {
  it('appends _test to the database name', () => {
    expect(
      testDatabaseUrl({ DATABASE_URL: 'postgresql://a:b@h:5432/baliqbozor?schema=public' }),
    ).toBe('postgresql://a:b@h:5432/baliqbozor_test?schema=public');
  });

  it('keeps names that already end with _test and prefers DATABASE_URL_TEST', () => {
    expect(testDatabaseUrl({ DATABASE_URL: 'postgresql://h/x_test' })).toBe(
      'postgresql://h/x_test',
    );
    expect(
      testDatabaseUrl({ DATABASE_URL: 'postgresql://h/x', DATABASE_URL_TEST: 'postgresql://h/y' }),
    ).toBe('postgresql://h/y');
  });

  it('requires a database url with a name', () => {
    expect(() => testDatabaseUrl({})).toThrow(/DATABASE_URL/);
    expect(() => testDatabaseUrl({ DATABASE_URL: 'postgresql://h' })).toThrow(/no database name/);
  });
});

describe('testRedisUrl', () => {
  it('moves the default database to 1 and keeps an explicit one', () => {
    expect(testRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379/1');
    expect(testRedisUrl('redis://localhost:6379/0')).toBe('redis://localhost:6379/1');
    expect(testRedisUrl('redis://localhost:6379/5')).toBe('redis://localhost:6379/5');
  });
});
