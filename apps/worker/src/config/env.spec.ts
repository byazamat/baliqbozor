import { loadEnv } from './env.js';

const minimal = {
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'b',
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(minimal);
    expect(env.WORKER_HEALTH_PORT).toBe(4010);
    expect(env.HEARTBEAT_INTERVAL_MS).toBe(60_000);
    expect(env.OUTBOX_POLL_INTERVAL_MS).toBe(1000);
    expect(env.APP_ENV).toBe('local');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('coerces numbers from strings', () => {
    expect(loadEnv({ ...minimal, WORKER_HEALTH_PORT: '0' }).WORKER_HEALTH_PORT).toBe(0);
  });

  it('lists every invalid variable', () => {
    expect(() => loadEnv({ WORKER_HEALTH_PORT: 'abc' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL|WORKER_HEALTH_PORT/,
    );
  });
});
