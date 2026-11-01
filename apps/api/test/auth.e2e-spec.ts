import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AuthService } from '../src/modules/auth/auth.service.js';
import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms, loginAs } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';

const PHONE = '+998901112233';
const OTP_REQUEST = '/api/v1/auth/otp/request';
const OTP_VERIFY = '/api/v1/auth/otp/verify';

describe('auth (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();
  let now: Date;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: SMS_PROVIDER, value: sms }] });
  });
  beforeEach(async () => {
    await resetState(app);
    sms.sent.length = 0;
    now = new Date();
    app.get(AuthService).clock = () => now;
  });
  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const advance = (sec: number) => {
    now = new Date(now.getTime() + sec * 1000);
  };

  it('registers a new user by SMS code, in the request language', async () => {
    const res = await request(server())
      .post(OTP_REQUEST)
      .set('Accept-Language', 'ru')
      .send({ phone: '+998 (90) 111-22-33' })
      .expect(200);
    expect(res.body).toEqual({ resendAfterSec: 60 });
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.phone).toBe(PHONE);
    expect(sms.sent[0]?.text).toMatch(/код для входа \d{6}/);

    const otpRow = await prismaOf(app).otpCode.findFirstOrThrow();
    expect(otpRow.codeHash).not.toContain(sms.lastCode(PHONE));

    const login = await request(server())
      .post(OTP_VERIFY)
      .set('Accept-Language', 'ru')
      .send({ phone: PHONE, code: sms.lastCode(PHONE) })
      .expect(200);
    expect(login.body).toMatchObject({
      isNewUser: true,
      accessTokenExpiresIn: 900,
      user: { phone: PHONE, locale: 'ru', platformRole: 'USER', fullName: null },
    });
    expect(typeof login.body.accessToken).toBe('string');
    expect(typeof login.body.refreshToken).toBe('string');

    const prisma = prismaOf(app);
    expect(
      await prisma.domainEvent.findFirst({ where: { type: 'user.registered' } }),
    ).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { action: 'auth.register' } })).not.toBeNull();

    advance(61);
    const again = await loginAs(app, sms, PHONE);
    expect(again.userId).toBe(login.body.user.id);
  });

  it('rejects malformed phones and codes', async () => {
    const bad = await request(server())
      .post(OTP_REQUEST)
      .send({ phone: '+7 900 123 45 67' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    await request(server()).post(OTP_VERIFY).send({ phone: PHONE, code: '12a456' }).expect(400);
    await request(server()).post(OTP_REQUEST).send({}).expect(400);
  });

  it('counts wrong attempts and locks the code after the limit', async () => {
    await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    const good = sms.lastCode(PHONE);
    const wrong = good === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i += 1) {
      const res = await request(server())
        .post(OTP_VERIFY)
        .send({ phone: PHONE, code: wrong })
        .expect(400);
      expect(res.body.error.code).toBe('OTP_INVALID');
    }
    const fifth = await request(server())
      .post(OTP_VERIFY)
      .send({ phone: PHONE, code: wrong })
      .expect(429);
    expect(fifth.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    const afterLock = await request(server())
      .post(OTP_VERIFY)
      .send({ phone: PHONE, code: good })
      .expect(429);
    expect(afterLock.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('expires codes and does not accept a code twice', async () => {
    await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    const code = sms.lastCode(PHONE);
    advance(301);
    const expired = await request(server())
      .post(OTP_VERIFY)
      .send({ phone: PHONE, code })
      .expect(400);
    expect(expired.body.error.code).toBe('OTP_EXPIRED');

    advance(60);
    await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    const fresh = sms.lastCode(PHONE);
    await request(server()).post(OTP_VERIFY).send({ phone: PHONE, code: fresh }).expect(200);
    const reused = await request(server())
      .post(OTP_VERIFY)
      .send({ phone: PHONE, code: fresh })
      .expect(400);
    expect(reused.body.error.code).toBe('OTP_EXPIRED');
  });

  it('enforces resend cooldown and blocks the phone after the hourly limit', async () => {
    await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    const cooldown = await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(429);
    expect(cooldown.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      details: { reason: 'COOLDOWN', retryAfterSec: 60 },
    });
    for (let i = 0; i < 4; i += 1) {
      advance(61);
      await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    }
    advance(61);
    const limited = await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(429);
    expect(limited.body.error.details).toMatchObject({
      reason: 'PHONE_LIMIT',
      retryAfterSec: 3600,
    });
    advance(61);
    const blocked = await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(429);
    expect(blocked.body.error.details.reason).toBe('BLOCKED');
    expect(sms.sent).toHaveLength(5);
  });

  it('accepts the local bypass code', async () => {
    await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    await request(server()).post(OTP_VERIFY).send({ phone: PHONE, code: '000000' }).expect(200);
  });

  it('rotates refresh tokens and revokes the whole family on reuse', async () => {
    const first = await loginAs(app, sms, PHONE);
    const rotated = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
    await request(server()).post('/api/v1/auth/logout').set(bearer(rotated.body)).expect(204);

    // Повторное использование старого refresh отзывает цепочку (и новый токен тоже).
    const second = await loginAs(app, sms, '+998901112244');
    const next = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(200);
    const reuse = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: second.refreshToken })
      .expect(401);
    expect(reuse.body.error.code).toBe('UNAUTHORIZED');
    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: next.body.refreshToken })
      .expect(401);
    await request(server()).post('/api/v1/auth/logout').set(bearer(next.body)).expect(401);
    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'x'.repeat(43) })
      .expect(401);
  });

  it('logout revokes the session immediately', async () => {
    const s = await loginAs(app, sms, PHONE);
    await request(server()).post('/api/v1/auth/logout').set(bearer(s)).expect(204);
    await request(server()).post('/api/v1/auth/logout').set(bearer(s)).expect(401);
    await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: s.refreshToken })
      .expect(401);
  });

  it('requires a valid token on protected routes', async () => {
    const res = await request(server()).post('/api/v1/auth/logout').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    await request(server())
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer garbage')
      .expect(401);
  });

  it('blocks login and cuts off sessions of a blocked user', async () => {
    const s = await loginAs(app, sms, PHONE);
    await prismaOf(app).user.update({ where: { id: s.userId }, data: { status: 'BLOCKED' } });
    await request(server()).post('/api/v1/auth/logout').set(bearer(s)).expect(401);
    advance(61);
    await request(server()).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    const res = await request(server())
      .post(OTP_VERIFY)
      .send({ phone: PHONE, code: sms.lastCode(PHONE) })
      .expect(403);
    expect(res.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'USER_BLOCKED' },
    });
  });

  it('turns pending invitations into memberships on first login', async () => {
    const prisma = prismaOf(app);
    const org = await prisma.organization.create({
      data: { type: 'BUYER', legalForm: 'LLC', name: 'Restoran' },
    });
    await prisma.orgInvitation.create({
      data: {
        orgId: org.id,
        phone: PHONE,
        role: 'STAFF',
        invitedById: '00000000-0000-4000-8000-000000000001',
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    const s = await loginAs(app, sms, PHONE);
    expect(
      await prisma.membership.findFirst({ where: { userId: s.userId, orgId: org.id } }),
    ).toMatchObject({
      role: 'STAFF',
    });
    expect((await prisma.orgInvitation.findFirstOrThrow()).acceptedAt).not.toBeNull();
    expect(await prisma.domainEvent.count({ where: { type: 'org.member.added' } })).toBe(1);
  });
});

describe('auth outside local (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();

  beforeAll(async () => {
    app = await createTestApp({
      env: {
        APP_ENV: 'staging',
        OTP_DEV_BYPASS_CODE: undefined,
        JWT_ACCESS_SECRET: 'a-very-long-staging-secret-for-tests-0123456789',
      },
      overrides: [{ token: SMS_PROVIDER, value: sms }],
    });
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it('does not accept the bypass code', async () => {
    const server = app.getHttpServer();
    await request(server).post(OTP_REQUEST).send({ phone: PHONE }).expect(200);
    const code = sms.lastCode(PHONE);
    if (code === '000000') return; // крайне маловероятное совпадение случайного кода
    const res = await request(server)
      .post(OTP_VERIFY)
      .send({ phone: PHONE, code: '000000' })
      .expect(400);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });
});
