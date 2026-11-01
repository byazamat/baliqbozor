import { truncateAll } from '@baliqbozor/db/testing';
import { Logger } from '@nestjs/common';

import { loadEnv } from '../src/config/env.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { NotificationHandlers } from '../src/notifications/notification.handlers.js';
import type { SmsSender } from '../src/notifications/sms.js';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher.js';
import { OutboxPoller } from '../src/outbox/outbox.poller.js';
import { PrismaOutboxSource } from '../src/outbox/prisma-outbox.source.js';

Logger.overrideLogger(false);

class FakeSms implements SmsSender {
  readonly sent: { phone: string; text: string }[] = [];
  send(phone: string, text: string): Promise<void> {
    this.sent.push({ phone, text });
    return Promise.resolve();
  }
}

describe('in-app notifications from outbox (e2e)', () => {
  const env = loadEnv();
  const prisma = new PrismaService(env);
  const sms = new FakeSms();
  let poller: OutboxPoller;

  beforeAll(() => {
    const dispatcher = new OutboxDispatcher();
    new NotificationHandlers(dispatcher, sms, env).onModuleInit();
    poller = new OutboxPoller(new PrismaOutboxSource(prisma), dispatcher.handle, {
      intervalMs: 1000,
      batchSize: 50,
    });
  });
  beforeEach(async () => {
    await truncateAll(prisma.client);
    sms.sent.length = 0;
  });
  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const db = () => prisma.client;
  const user = (
    phone: string,
    locale: 'uz' | 'ru' = 'uz',
    platformRole: 'USER' | 'OPERATOR' | 'ADMIN' = 'USER',
  ) => db().user.create({ data: { phone, locale, platformRole } });
  const event = (type: string, aggregateId: string, payload: object) =>
    db().domainEvent.create({
      data: { type, aggregateType: 'Organization', aggregateId, payload },
    });

  it('notifies organization owners in their language when verification is decided', async () => {
    const ownerRu = await user('+998901000001', 'ru');
    const ownerUz = await user('+998901000002', 'uz');
    const staff = await user('+998901000003', 'ru');
    const outsider = await user('+998901000004', 'ru');
    const org = await db().organization.create({
      data: {
        type: 'SELLER',
        legalForm: 'LLC',
        name: 'Samarqand Baliq',
        members: {
          create: [
            { userId: ownerRu.id, role: 'OWNER' },
            { userId: ownerUz.id, role: 'OWNER' },
            { userId: staff.id, role: 'STAFF' },
          ],
        },
      },
    });
    await event('org.verification.approved', org.id, { orgId: org.id, operatorId: outsider.id });
    await event('org.verification.rejected', org.id, {
      orgId: org.id,
      operatorId: outsider.id,
      note: 'фото нечитаемое',
    });
    expect(await poller.tick()).toBe(2);

    const rows = await db().notification.findMany({
      orderBy: [{ eventType: 'asc' }, { userId: 'asc' }],
    });
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [ownerRu.id, ownerRu.id, ownerUz.id, ownerUz.id].sort(),
    );
    const ru = rows.find(
      (r) => r.userId === ownerRu.id && r.eventType === 'org.verification.approved',
    );
    expect(ru).toMatchObject({
      title: 'Организация подтверждена',
      channel: 'IN_APP',
      status: 'SENT',
      data: { orgId: org.id },
    });
    expect(ru?.body).toContain('«Samarqand Baliq»');
    const uzRejected = rows.find(
      (r) => r.userId === ownerUz.id && r.eventType === 'org.verification.rejected',
    );
    expect(uzRejected?.title).toBe('Tekshiruv rad etildi');
    expect(uzRejected?.body).toContain('фото нечитаемое');
    expect(await db().domainEvent.count({ where: { processedAt: null } })).toBe(0);
  });

  it('notifies all active operators about new tasks and added members personally', async () => {
    const op = await user('+998901000011', 'ru', 'OPERATOR');
    const admin = await user('+998901000012', 'uz', 'ADMIN');
    const blocked = await db().user.create({
      data: { phone: '+998901000013', platformRole: 'OPERATOR', status: 'BLOCKED' },
    });
    const member = await user('+998901000014', 'ru');
    const owner = await user('+998901000015', 'ru');
    const org = await db().organization.create({
      data: { type: 'BUYER', legalForm: 'LLC', name: 'Restoran' },
    });

    await event('ops.task.created', 'task-1', {
      taskId: 'task-1',
      type: 'VERIFY_ORG',
      orgId: org.id,
    });
    await event('org.member.added', org.id, {
      orgId: org.id,
      userId: member.id,
      role: 'STAFF',
      byUserId: owner.id,
    });
    await poller.tick();

    const ops = await db().notification.findMany({ where: { eventType: 'ops.task.created' } });
    expect(ops.map((n) => n.userId).sort()).toEqual([op.id, admin.id].sort());
    expect(ops.find((n) => n.userId === op.id)?.body).toContain('«Restoran»');
    expect(ops.some((n) => n.userId === blocked.id)).toBe(false);
    const added = await db().notification.findMany({ where: { eventType: 'org.member.added' } });
    expect(added).toEqual([
      expect.objectContaining({ userId: member.id, title: 'Вас добавили в организацию' }),
    ]);
  });

  it('sends an SMS invitation to a phone without an account, once and only while active', async () => {
    const inviter = await user('+998901000021');
    const org = await db().organization.create({
      data: { type: 'SELLER', legalForm: 'LLC', name: 'Forel' },
    });
    const inv = await db().orgInvitation.create({
      data: {
        orgId: org.id,
        phone: '+998901000022',
        role: 'STAFF',
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const revoked = await db().orgInvitation.create({
      data: {
        orgId: org.id,
        phone: '+998901000023',
        role: 'STAFF',
        invitedById: inviter.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: new Date(),
      },
    });
    await event('org.member.invited', org.id, {
      orgId: org.id,
      invitationId: inv.id,
      role: 'STAFF',
      byUserId: inviter.id,
    });
    await event('org.member.invited', org.id, {
      orgId: org.id,
      invitationId: revoked.id,
      role: 'STAFF',
      byUserId: inviter.id,
    });
    await poller.tick();
    await poller.tick();

    expect(sms.sent).toEqual([
      { phone: '+998901000022', text: expect.stringContaining('«Forel»') as string },
    ]);
    expect(sms.sent[0]?.text).toContain('http://localhost:3000/login');
    expect(await db().notification.count()).toBe(0);
  });
});
