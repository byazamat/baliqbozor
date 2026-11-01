import { loadEnv } from './env.js';

const valid = {
  API_URL: 'http://localhost:4000',
  WEB_URL: 'http://localhost:3000',
  ADMIN_URL: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/baliqbozor',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'baliqbozor-private',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio123',
  JWT_ACCESS_SECRET: 'change-me',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv({ ...valid, SENTRY_DSN_API: '  ' });
    expect(env.APP_ENV).toBe('local');
    expect(env.API_PORT).toBe(4000);
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.SENTRY_DSN_API).toBeUndefined();
    expect(env.BRAND_NAME).toBe('BaliqBozor');
  });

  it('coerces and validates values', () => {
    expect(loadEnv({ ...valid, API_PORT: '4100', S3_FORCE_PATH_STYLE: 'false' })).toMatchObject({
      API_PORT: 4100,
      S3_FORCE_PATH_STYLE: false,
    });
  });

  it('lists every invalid variable', () => {
    expect(() => loadEnv({ ...valid, APP_ENV: 'dev', WEB_URL: 'nope', DATABASE_URL: '' })).toThrow(
      /APP_ENV[\s\S]*WEB_URL[\s\S]*DATABASE_URL/,
    );
  });

  it('allows a weak JWT secret and the OTP bypass only locally', () => {
    expect(loadEnv({ ...valid, OTP_DEV_BYPASS_CODE: '000000' }).OTP_DEV_BYPASS_CODE).toBe('000000');
    expect(() => loadEnv({ ...valid, APP_ENV: 'staging' })).toThrow(/JWT_ACCESS_SECRET/);
    const strong = 'x'.repeat(40);
    expect(() =>
      loadEnv({
        ...valid,
        APP_ENV: 'production',
        JWT_ACCESS_SECRET: strong,
        OTP_DEV_BYPASS_CODE: '000000',
      }),
    ).toThrow(/OTP_DEV_BYPASS_CODE/);
    expect(loadEnv({ ...valid, APP_ENV: 'production', JWT_ACCESS_SECRET: strong }).APP_ENV).toBe(
      'production',
    );
  });
});
