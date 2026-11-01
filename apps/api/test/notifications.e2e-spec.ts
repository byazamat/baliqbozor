import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { SMS_PROVIDER } from '../src/providers/sms/sms.provider.js';
import { bearer, FakeSms } from './auth-helpers.js';
import { createTestApp } from './create-test-app.js';
import { prismaOf, resetState } from './db.js';
import { actor, expectIsolated } from './fixtures.js';

describe('notifications API (e2e)', () => {
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
  const seed = (userId: string, n: number) =>
    prismaOf(app).notification.createMany({
      data: Array.from({ length: n }, (_, i) => ({
        userId,
        eventType: 'org.verification.approved',
        channel: 'IN_APP' as const,
        title: `T${String(i)}`,
        body: 'B',
        status: 'SENT' as const,
        createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, i)),
      })),
    });

  it('lists own notifications newest first with cursor and unread count', async () => {
    const u = await actor(app, sms);
    await seed(u.userId, 3);
    const first = await http().get('/api/v1/notifications?limit=2').set(bearer(u)).expect(200);
    expect(first.body).toMatchObject({ unreadCount: 3 });
    expect((first.body.items as { title: string }[]).map((n) => n.title)).toEqual(['T2', 'T1']);
    const second = await http()
      .get(`/api/v1/notifications?limit=2&cursor=${first.body.nextCursor as string}`)
      .set(bearer(u))
      .expect(200);
    expect((second.body.items as { title: string }[]).map((n) => n.title)).toEqual(['T0']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('marks one or all as read; unreadOnly filter', async () => {
    const u = await actor(app, sms);
    await seed(u.userId, 3);
    const list = await http().get('/api/v1/notifications').set(bearer(u)).expect(200);
    const id = list.body.items[0].id as string;
    await http().post(`/api/v1/notifications/${id}/read`).set(bearer(u)).expect(204);
    await http().post(`/api/v1/notifications/${id}/read`).set(bearer(u)).expect(204);
    const unread = await http()
      .get('/api/v1/notifications?unreadOnly=true')
      .set(bearer(u))
      .expect(200);
    expect(unread.body).toMatchObject({ unreadCount: 2 });
    expect(unread.body.items).toHaveLength(2);
    const all = await http().post('/api/v1/notifications/read-all').set(bearer(u)).expect(200);
    expect(all.body).toEqual({ updated: 2 });
    expect(
      (await http().get('/api/v1/notifications').set(bearer(u)).expect(200)).body.unreadCount,
    ).toBe(0);
  });

  it('never shows or touches other users’ notifications', async () => {
    const a = await actor(app, sms);
    const b = await actor(app, sms);
    await seed(a.userId, 2);
    const ofA = await http().get('/api/v1/notifications').set(bearer(a)).expect(200);
    const listB = await http().get('/api/v1/notifications').set(bearer(b)).expect(200);
    expect(listB.body).toEqual({ items: [], nextCursor: null, unreadCount: 0 });
    await expectIsolated(
      http()
        .post(`/api/v1/notifications/${ofA.body.items[0].id as string}/read`)
        .set(bearer(b)),
    );
    expect(
      (await http().post('/api/v1/notifications/read-all').set(bearer(b)).expect(200)).body.updated,
    ).toBe(0);
    expect(
      (await http().get('/api/v1/notifications').set(bearer(a)).expect(200)).body.unreadCount,
    ).toBe(2);
    await http().get('/api/v1/notifications').expect(401);
    await http().get('/api/v1/notifications?cursor=garbage').set(bearer(a)).expect(400);
  });
});
