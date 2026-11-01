import { OUTBOX_MAX_ATTEMPTS, outboxRetryDelayMs } from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../infra/prisma.service.js';
import type { OutboxEvent, OutboxHandler, OutboxSource } from './outbox.types.js';

/** Сколько событие закреплено за worker'ом после захвата; потом его может взять другой. */
export const OUTBOX_LEASE_MS = 60_000;

interface ClaimedRow {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

/**
 * Outbox на Prisma (D-40): `FOR UPDATE SKIP LOCKED` — параллельные worker'ы не берут одно
 * событие; `availableAt` — и аренда, и пауза перед повтором.
 */
@Injectable()
export class PrismaOutboxSource implements OutboxSource {
  /** Источник времени; в тестах подменяется. */
  clock: () => Date = () => new Date();

  constructor(private readonly prisma: PrismaService) {}

  async claimBatch(limit: number): Promise<OutboxEvent[]> {
    const now = this.clock();
    const leaseUntil = new Date(now.getTime() + OUTBOX_LEASE_MS);
    const rows = await this.prisma.client.$queryRaw<ClaimedRow[]>`
      UPDATE "DomainEvent" SET "attempts" = "attempts" + 1, "availableAt" = ${leaseUntil}
      WHERE "id" IN (
        SELECT "id" FROM "DomainEvent"
        WHERE "processedAt" IS NULL AND "availableAt" <= ${now} AND "attempts" < ${OUTBOX_MAX_ATTEMPTS}
        ORDER BY "createdAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "type", "aggregateType", "aggregateId", "payload", "attempts", "createdAt"`;
    // RETURNING не сохраняет порядок подзапроса — сортируем сами.
    return rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(({ id, type, aggregateType, aggregateId, payload, attempts }) => ({
        id,
        type,
        aggregateType,
        aggregateId,
        payload,
        attempts,
      }));
  }

  async complete(event: OutboxEvent, handler: OutboxHandler): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await handler(event, tx);
      await tx.domainEvent.update({
        where: { id: event.id },
        data: { processedAt: this.clock(), lastError: null },
      });
    });
  }

  async fail(event: OutboxEvent, error: string): Promise<void> {
    await this.prisma.client.domainEvent.update({
      where: { id: event.id },
      data: {
        lastError: error,
        availableAt: new Date(this.clock().getTime() + outboxRetryDelayMs(event.attempts)),
      },
    });
  }
}
