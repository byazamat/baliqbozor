import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import type { SmsProvider } from '../src/providers/sms/sms.provider.js';

/** SMS-провайдер для тестов: запоминает отправленные сообщения. */
export class FakeSms implements SmsProvider {
  readonly sent: { phone: string; text: string }[] = [];

  send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text });
    return Promise.resolve();
  }

  lastCode(phone: string): string {
    const msg = [...this.sent].reverse().find((m) => m.phone === phone);
    const code = /\b(\d{6})\b/.exec(msg?.text ?? '')?.[1];
    if (!code) throw new Error(`No OTP sent to ${phone}`);
    return code;
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Полный вход по OTP (код берётся из FakeSms). */
export async function loginAs(
  app: INestApplication,
  sms: FakeSms,
  phone: string,
): Promise<Session> {
  const server = app.getHttpServer();
  await request(server).post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await request(server)
    .post('/api/v1/auth/otp/verify')
    .send({ phone, code: sms.lastCode(phone) })
    .expect(200);
  const body = res.body as { accessToken: string; refreshToken: string; user: { id: string } };
  return { accessToken: body.accessToken, refreshToken: body.refreshToken, userId: body.user.id };
}

export const bearer = (s: { accessToken: string }) => ({
  Authorization: `Bearer ${s.accessToken}`,
});
