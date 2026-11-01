import type { TransactionClient } from '@baliqbozor/db';
import type { DomainEventPayloads, DomainEventType } from '@baliqbozor/domain';
import { type Locale, type MessageKey, translate, type TranslateParams } from '@baliqbozor/i18n';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';

import { ENV, type Env } from '../config/env.js';
import { OutboxDispatcher } from '../outbox/outbox.dispatcher.js';
import type { OutboxEvent } from '../outbox/outbox.types.js';
import { SMS_SENDER, type SmsSender } from './sms.js';

interface Recipient {
  id: string;
  locale: Locale;
}

/**
 * Уведомления по каталогу SPEC 11.2 (события M1). In-app — запись `Notification` в транзакции
 * обработки события (статус SENT сразу: доставка = запись). SMS — после записи, перед коммитом.
 */
@Injectable()
export class NotificationHandlers implements OnModuleInit {
  constructor(
    private readonly dispatcher: OutboxDispatcher,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.handle('org.verification.approved', async (p, tx) => {
      const org = await this.orgName(tx, p.orgId);
      await this.notify(
        tx,
        await this.owners(tx, p.orgId),
        'org.verification.approved',
        'notifications.org.verification.approved',
        { org },
        { orgId: p.orgId },
      );
    });
    this.handle('org.verification.rejected', async (p, tx) => {
      const org = await this.orgName(tx, p.orgId);
      await this.notify(
        tx,
        await this.owners(tx, p.orgId),
        'org.verification.rejected',
        'notifications.org.verification.rejected',
        { org, note: p.note },
        { orgId: p.orgId },
      );
    });
    this.handle('org.member.added', async (p, tx) => {
      if (p.userId === p.byUserId) return;
      const user = await tx.user.findUnique({
        where: { id: p.userId },
        select: { id: true, locale: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE') return;
      const org = await this.orgName(tx, p.orgId);
      await this.notify(
        tx,
        [user],
        'org.member.added',
        'notifications.org.member.added',
        { org },
        { orgId: p.orgId },
      );
    });
    this.handle('ops.task.created', async (p, tx) => {
      const operators = await tx.user.findMany({
        where: { platformRole: { in: ['OPERATOR', 'ADMIN'] }, status: 'ACTIVE' },
        select: { id: true, locale: true },
      });
      const org = p.orgId ? await this.orgName(tx, p.orgId) : '';
      await this.notify(
        tx,
        operators,
        'ops.task.created',
        'notifications.ops.task.created',
        { org },
        { taskId: p.taskId, type: p.type, ...(p.orgId ? { orgId: p.orgId } : {}) },
      );
    });
    this.handle('org.member.invited', async (p, tx) => {
      const inv = await tx.orgInvitation.findUnique({
        where: { id: p.invitationId },
        include: { org: { select: { name: true } } },
      });
      if (!inv || inv.acceptedAt || inv.revokedAt) return;
      // Номера ещё нет в системе — язык неизвестен, по умолчанию uz (D-33).
      const text = translate('uz', 'notifications.org.member.invited.sms', {
        brand: this.env.BRAND_NAME,
        org: inv.org.name,
        url: `${this.env.WEB_URL.replace(/\/$/, '')}/login`,
      });
      await this.sms.send(inv.phone, text);
    });
  }

  private handle<T extends DomainEventType>(
    type: T,
    fn: (payload: DomainEventPayloads[T], tx: TransactionClient) => Promise<void>,
  ): void {
    this.dispatcher.on(type, (event: OutboxEvent, tx) =>
      fn(event.payload as DomainEventPayloads[T], tx),
    );
  }

  private async owners(tx: TransactionClient, orgId: string): Promise<Recipient[]> {
    const rows = await tx.membership.findMany({
      where: { orgId, role: 'OWNER', user: { status: 'ACTIVE' } },
      select: { user: { select: { id: true, locale: true } } },
    });
    return rows.map((r) => r.user);
  }

  private async orgName(tx: TransactionClient, orgId: string): Promise<string> {
    return (
      (await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } }))?.name ??
      ''
    );
  }

  private async notify(
    tx: TransactionClient,
    recipients: Recipient[],
    eventType: DomainEventType,
    keyBase: string,
    params: TranslateParams,
    data: Record<string, string>,
  ): Promise<void> {
    if (recipients.length === 0) return;
    const now = new Date();
    await tx.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        eventType,
        channel: 'IN_APP' as const,
        title: translate(r.locale, `${keyBase}.title` as MessageKey, params),
        body: translate(r.locale, `${keyBase}.body` as MessageKey, params),
        data,
        status: 'SENT' as const,
        sentAt: now,
      })),
    });
  }
}
