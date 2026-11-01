import { Public } from '../src/modules/auth/public.decorator.js';
import { Decimal, DomainError, ErrorCode } from '@baliqbozor/domain';
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsInt, IsString, Min } from 'class-validator';
import request from 'supertest';

import { createTestApp } from './create-test-app.js';

class EchoDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(100)
  volumeKg: number;
}

@Public()
@Controller('__test')
class FixtureController {
  @Get('domain-error')
  domainError(): never {
    throw new DomainError(ErrorCode.INSUFFICIENT_VOLUME, 'not enough', {
      availableKg: '350.000',
      requestedKg: '500.000',
    });
  }

  @Get('crash')
  crash(): never {
    throw new Error('secret internal detail');
  }

  @Get('money')
  money(): { pricePerKg: bigint; volumeKg: Decimal } {
    return { pricePerKg: 28000n, volumeKg: new Decimal('1500.5') };
  }

  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto {
    return body;
  }
}

@Module({ controllers: [FixtureController] })
class FixtureModule {}

const ERROR_SHAPE = {
  error: {
    code: expect.any(String),
    message: expect.any(String),
    requestId: expect.any(String),
  },
};

describe('error format SPEC 10.2 (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ extraModules: [FixtureModule] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('unknown route → 404 NOT_FOUND in uz by default', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject(ERROR_SHAPE);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Topilmadi' });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('localizes message by Accept-Language and echoes X-Request-Id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .set('Accept-Language', 'ru-RU,ru;q=0.9')
      .set('X-Request-Id', 'client-request-0001')
      .expect(404);
    expect(res.body.error).toMatchObject({
      message: 'Не найдено',
      requestId: 'client-request-0001',
    });
  });

  it('DomainError → its code, status and details', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/__test/domain-error')
      .set('Accept-Language', 'ru')
      .expect(409);
    expect(res.body).toEqual({
      error: {
        code: 'INSUFFICIENT_VOLUME',
        message: 'Недостаточно доступного объёма',
        details: { availableKg: '350.000', requestedKg: '500.000' },
        requestId: expect.any(String),
      },
    });
  });

  it('validation errors → 400 VALIDATION_FAILED with fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/__test/echo')
      .send({ name: 42, volumeKg: 10, extra: true })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields).toEqual(
      expect.arrayContaining([
        { field: 'name', constraints: ['isString'] },
        { field: 'volumeKg', constraints: ['min'] },
        { field: 'extra', constraints: ['whitelistValidation'] },
      ]),
    );
  });

  it('malformed JSON → 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/__test/echo')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('unexpected error → 500 INTERNAL_ERROR without internals', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/__test/crash').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
  });

  it('serializes BigInt and Decimal as strings', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/__test/money').expect(200);
    expect(res.body).toEqual({ pricePerKg: '28000', volumeKg: '1500.5' });
  });

  it('valid body passes through the prefix', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/__test/echo')
      .send({ name: 'ok', volumeKg: 150 })
      .expect(201, { name: 'ok', volumeKg: 150 });
  });
});

describe('HTTP hardening (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets Helmet headers and hides x-powered-by', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS only for WEB_URL and ADMIN_URL', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const admin = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3001');
    expect(admin.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    const denied = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves Swagger UI outside production', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
    const json = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(json.body.paths['/health']).toBeDefined();
  });
});

describe('production mode (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ env: { APP_ENV: 'production' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not expose Swagger', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(404);
  });
});
