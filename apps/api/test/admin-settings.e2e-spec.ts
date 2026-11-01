import { SETTING_KEYS } from '@baliqbozor/domain';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor } from './fixtures.js';

interface SettingRow {
  key: string;
  value: unknown;
  defaultValue: unknown;
  changed: boolean;
  updatedById: string | null;
}

describe('admin settings (e2e)', () => {
  let app: NestExpressApplication;
  const sms = new FakeSms();

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ token: SMS_PROVIDER, value: sms }] });
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('lists all settings 8.13 with defaults and updates one with audit', async () => {
    const admin = await actor(app, sms, 'ADMIN');
    const list = await http().get('/api/v1/admin/settings').set(bearer(admin)).expect(200);
    const items = list.body.items as SettingRow[];
    expect(items.map((i) => i.key)).toEqual(SETTING_KEYS);
    expect(items.find((i) => i.key === 'matching.weights')).toMatchObject({
      value: { distance: 0.35, price: 0.25, reliability: 0.2, freshness: 0.1, volume: 0.1 },
      changed: false,
    });

    const updated = await http()
      .patch('/api/v1/admin/settings')
      .set(bearer(admin))
      .send({ key: 'commission.defaultRateBps', value: 150 })
      .expect(200);
    expect(updated.body).toMatchObject({
      key: 'commission.defaultRateBps',
      value: 150,
      defaultValue: 200,
      changed: true,
      updatedById: admin.userId,
    });
    const workingHours = await http()
      .patch('/api/v1/admin/settings')
      .set(bearer(admin))
      .send({ key: 'ops.workingHours', value: { from: '09:00', to: '18:00' } })
      .expect(200);
    expect(workingHours.body.value).toEqual({ from: '09:00', to: '18:00' });

    const again = await http().get('/api/v1/admin/settings').set(bearer(admin)).expect(200);
    expect(
      (again.body.items as SettingRow[]).find((i) => i.key === 'commission.defaultRateBps')?.value,
    ).toBe(150);
    const audit = await prismaOf(app).auditLog.findFirstOrThrow({
      where: { action: 'settings.update', entityId: 'commission.defaultRateBps' },
    });
    expect(audit).toMatchObject({ actorUserId: admin.userId, before: 200, after: 150 });
  });

  it('validates key and value against the setting schema', async () => {
    const admin = await actor(app, sms, 'ADMIN');
    const patch = (body: object) =>
      http().patch('/api/v1/admin/settings').set(bearer(admin)).send(body);

    const unknown = await patch({ key: 'nope.key', value: 1 }).expect(400);
    expect(unknown.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    const invalid = await patch({ key: 'commission.defaultRateBps', value: 20_000 }).expect(400);
    // Проблемы — коды без текста: тексты на uz/ru строит админка (D-50).
    expect(invalid.body.error.details).toEqual({
      key: 'commission.defaultRateBps',
      issues: [{ code: 'max', max: 10_000 }],
    });
    await patch({ key: 'matching.weights', value: { distance: 1, price: 1 } }).expect(400);
    await patch({ key: 'otp.maxAttempts', value: '5' }).expect(400);
    await patch({ key: 'otp.maxAttempts' }).expect(400);
    expect(await prismaOf(app).setting.count()).toBe(0);
  });

  it('is available to ADMIN only', async () => {
    const operator = await actor(app, sms, 'OPERATOR');
    const user = await actor(app, sms);
    for (const who of [operator, user]) {
      await http().get('/api/v1/admin/settings').set(bearer(who)).expect(403);
      await http()
        .patch('/api/v1/admin/settings')
        .set(bearer(who))
        .send({ key: 'otp.maxAttempts', value: 3 })
        .expect(403);
    }
    await http().get('/api/v1/admin/settings').expect(401);
  });
});
