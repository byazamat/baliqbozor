import { loadEnv } from '../config/env.js';
import { loggerParams } from './logger.js';

const env = loadEnv({
  NODE_ENV: 'test',
  API_URL: 'http://localhost:4000',
  WEB_URL: 'http://localhost:3000',
  ADMIN_URL: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://x',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'b',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 's',
});

describe('loggerParams', () => {
  const pinoHttp = loggerParams(env).pinoHttp as {
    formatters: { log: (o: Record<string, unknown>) => Record<string, unknown> };
    serializers: { req: (r: { id: string; method: string; url: string }) => unknown };
    transport?: unknown;
  };

  it('masks phones in structured log fields', () => {
    expect(
      pinoHttp.formatters.log({
        msg: 'otp for +998901234567',
        ctx: { phone: '998901234567' },
        list: ['+998 90 123 45 67'],
      }),
    ).toEqual({
      msg: 'otp for +99890*****67',
      ctx: { phone: '99890*****67' },
      list: ['+99890*****67'],
    });
  });

  it('masks phones in request urls and drops headers', () => {
    expect(
      pinoHttp.serializers.req({
        id: 'r1',
        method: 'GET',
        url: '/x?phone=%2B998901234567&p=998901234567',
      }),
    ).toEqual({
      id: 'r1',
      method: 'GET',
      url: '/x?phone=+99890*****67&p=99890*****67',
    });
  });

  it('survives malformed encoding', () => {
    expect(pinoHttp.serializers.req({ id: 'r2', method: 'GET', url: '/%E0%A4%A' })).toMatchObject({
      url: '/%E0%A4%A',
    });
  });

  it('does not use pretty transport outside local development', () => {
    expect(pinoHttp.transport).toBeUndefined();
  });
});
