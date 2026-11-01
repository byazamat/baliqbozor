import { describe, expect, it } from 'vitest';

import { testDatabaseUrl, testRedisUrl } from './testing.js';

describe('testDatabaseUrl', () => {
  it('appends _test_<scope> to the database name', () => {
    expect(
      testDatabaseUrl({ DATABASE_URL: 'postgresql://a:b@h:5432/baliqbozor?schema=public' }, 'api'),
    ).toBe('postgresql://a:b@h:5432/baliqbozor_test_api?schema=public');
    expect(testDatabaseUrl({ DATABASE_URL: 'postgresql://h/baliqbozor' }, 'worker')).toBe(
      'postgresql://h/baliqbozor_test_worker',
    );
  });

  it('keeps names that already are test databases and scopes DATABASE_URL_TEST', () => {
    expect(testDatabaseUrl({ DATABASE_URL: 'postgresql://h/x_test_api' }, 'api')).toBe(
      'postgresql://h/x_test_api',
    );
    expect(
      testDatabaseUrl(
        { DATABASE_URL: 'postgresql://h/x', DATABASE_URL_TEST: 'postgresql://h/y' },
        'worker',
      ),
    ).toBe('postgresql://h/y_worker');
  });

  it('requires a database url with a name', () => {
    expect(() => testDatabaseUrl({}, 'api')).toThrow(/DATABASE_URL/);
    expect(() => testDatabaseUrl({ DATABASE_URL: 'postgresql://h' }, 'api')).toThrow(
      /no database name/,
    );
  });
});

describe('testRedisUrl', () => {
  it('uses a separate database per scope and keeps an explicit one', () => {
    expect(testRedisUrl('redis://localhost:6379', 'api')).toBe('redis://localhost:6379/1');
    expect(testRedisUrl('redis://localhost:6379/0', 'worker')).toBe('redis://localhost:6379/2');
    expect(testRedisUrl('redis://localhost:6379/5', 'api')).toBe('redis://localhost:6379/5');
  });
});
