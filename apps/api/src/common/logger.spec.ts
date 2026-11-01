import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

import { loadEnv } from '../config/env.js';
import { authLogProps, loggerParams } from './logger.js';

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
    serializers: {
      req: (r: { id: string; method: string; url: string }) => unknown;
      res: (r: { statusCode: number | null; headers?: unknown }) => unknown;
    };
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

  it('passes non-plain objects (http response) through untouched for serializers', () => {
    const res = new ServerResponse(new IncomingMessage(new Socket()));
    const out = pinoHttp.formatters.log({ res });
    expect(out.res).toBe(res);
  });

  it('logs only the response status', () => {
    expect(pinoHttp.serializers.res({ statusCode: 201, headers: { 'set-cookie': 'x' } })).toEqual({
      statusCode: 201,
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

describe('authLogProps', () => {
  it('adds userId and orgId of an authenticated request', () => {
    const req = new IncomingMessage(new Socket()) as IncomingMessage & { auth?: unknown };
    expect(authLogProps(req)).toEqual({});
    req.auth = { userId: 'u1', platformRole: 'USER', sessionId: 's' };
    expect(authLogProps(req)).toEqual({ userId: 'u1' });
    req.auth = {
      userId: 'u1',
      platformRole: 'USER',
      sessionId: 's',
      org: { id: 'o1', type: 'SELLER', role: 'OWNER' },
    };
    expect(authLogProps(req)).toEqual({ userId: 'u1', orgId: 'o1' });
  });
});
