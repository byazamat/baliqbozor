import type { TransactionClient } from '@baliqbozor/db';
import type { DomainEventPayloads, DomainEventType } from '@baliqbozor/domain';
import type { MemberRole } from '@baliqbozor/domain';
import {
  formatDateTime,
  formatKg,
  type Locale,
  type MessageKey,
  translate,
  type TranslateParams,
} from '@baliqbozor/i18n';
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
 * Уведомления по каталогу SPEC 11.2 (события M1 и M2). In-app — запись `Notification` в транзакции
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
    this.handle('listing.freshness_reminder', async (p, tx) => {
      const l = await this.listing(tx, p.listingId);
      if (!l || l.status !== 'ACTIVE') return;
      await this.notify(
        tx,
        await this.members(tx, p.orgId, ['OWNER', 'MANAGER', 'STAFF']),
        'listing.freshness_reminder',
        'notifications.listing.freshness_reminder',
        (locale) => ({
          ...l.names(locale),
          volume: formatKg(l.availableKg, locale),
          date: formatDateTime(p.dueAt),
        }),
        { listingId: p.listingId, orgId: p.orgId },
      );
    });
    this.handle('listing.auto_paused', async (p, tx) => {
      const l = await this.listing(tx, p.listingId);
      if (!l) return;
      await this.notify(
        tx,
        await this.members(tx, p.orgId, ['OWNER', 'MANAGER']),
        'listing.auto_paused',
        'notifications.listing.auto_paused',
        (locale) => ({ ...l.names(locale), days: String(p.freshnessDays) }),
        { listingId: p.listingId, orgId: p.orgId },
      );
    });
    this.handle('listing.expired', async (p, tx) => {
      const l = await this.listing(tx, p.listingId);
      if (!l) return;
      await this.notify(
        tx,
        await this.members(tx, p.orgId, ['OWNER', 'MANAGER']),
        'listing.expired',
        'notifications.listing.expired',
        (locale) => l.names(locale),
        { listingId: p.listingId, orgId: p.orgId },
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

  private async members(
    tx: TransactionClient,
    orgId: string,
    roles: MemberRole[],
  ): Promise<Recipient[]> {
    const rows = await tx.membership.findMany({
      where: { orgId, role: { in: roles }, user: { status: 'ACTIVE' } },
      select: { user: { select: { id: true, locale: true } } },
    });
    return rows.map((r) => r.user);
  }

  /** Позиция наличия для текста: вид и размер на языке получателя, доступный объём. */
  private async listing(tx: TransactionClient, id: string) {
    const l = await tx.listing.findUnique({
      where: { id },
      include: {
        species: { select: { nameUz: true, nameRu: true } },
        sizeClass: { select: { labelUz: true, labelRu: true } },
      },
    });
    if (!l) return null;
    return {
      status: l.status,
      availableKg: l.volumeKg.minus(l.reservedKg).minus(l.soldKg).toString(),
      names: (locale: Locale) => ({
        species: locale === 'ru' ? l.species.nameRu : l.species.nameUz,
        size: locale === 'ru' ? l.sizeClass.labelRu : l.sizeClass.labelUz,
      }),
    };
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
    params: TranslateParams | ((locale: Locale) => TranslateParams),
    data: Record<string, string>,
  ): Promise<void> {
    if (recipients.length === 0) return;
    const paramsFor = (locale: Locale) => (typeof params === 'function' ? params(locale) : params);
    const now = new Date();
    await tx.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        eventType,
        channel: 'IN_APP' as const,
        title: translate(r.locale, `${keyBase}.title` as MessageKey, paramsFor(r.locale)),
        body: translate(r.locale, `${keyBase}.body` as MessageKey, paramsFor(r.locale)),
        data,
        status: 'SENT' as const,
        sentAt: now,
      })),
    });
  }
}
