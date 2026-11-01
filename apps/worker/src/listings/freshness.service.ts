import type { Prisma } from '@baliqbozor/db';
import {
  dateOnly,
  freshnessCutoffs,
  freshnessDecision,
  freshnessDueAt,
  type FreshnessDecision,
  isWithinWorkingHours,
  nextListingState,
  resolveSettings,
  tashkentDate,
} from '@baliqbozor/domain';
import { Injectable, Logger } from '@nestjs/common';

import { recordEvent } from '../infra/events.js';
import { PrismaService } from '../infra/prisma.service.js';

const BATCH = 200;

export interface FreshnessRunResult {
  expired: number;
  autoPaused: number;
  reminded: number;
}

/**
 * Свежесть наличия (SPEC 8.3, D-51): истечение по `availableTo`, напоминание за сутки до срока,
 * автопауза в срок. Каждая позиция — своя транзакция с блокировкой строки и повторной проверкой,
 * поэтому повторный или параллельный прогон ничего не дублирует.
 */
@Injectable()
export class FreshnessService {
  private readonly logger = new Logger(FreshnessService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(now = new Date()): Promise<FreshnessRunResult> {
    const stored = await this.prisma.client.setting.findMany();
    const settings = resolveSettings(new Map(stored.map((s) => [s.key, s.value]))).values;
    const rules = {
      freshnessDays: settings['listing.freshnessDays'],
      workingHours: settings['ops.workingHours'],
    };
    const cut = freshnessCutoffs(now, rules.freshnessDays);
    const today = new Date(tashkentDate(now));

    const expired = await this.each(
      { status: { in: ['ACTIVE', 'PAUSED', 'SOLD_OUT'] }, availableTo: { lt: today } },
      'EXPIRE',
      now,
      rules,
    );
    const autoPaused = await this.each(
      { status: 'ACTIVE', lastConfirmedAt: { lte: cut.pauseIfConfirmedBefore } },
      'AUTOPAUSE',
      now,
      rules,
    );
    const reminded = isWithinWorkingHours(now, rules.workingHours)
      ? await this.each(
          { status: 'ACTIVE', lastConfirmedAt: { lte: cut.remindIfConfirmedBefore } },
          'REMIND',
          now,
          rules,
        )
      : 0;
    if (expired + autoPaused + reminded > 0) {
      this.logger.log(
        `freshness: expired ${String(expired)}, paused ${String(autoPaused)}, reminded ${String(reminded)}`,
      );
    }
    return { expired, autoPaused, reminded };
  }

  private async each(
    where: Prisma.ListingWhereInput,
    decision: Exclude<FreshnessDecision, null>,
    now: Date,
    rules: { freshnessDays: number; workingHours: { from: string; to: string } },
  ): Promise<number> {
    let done = 0;
    let afterId: string | undefined;
    for (;;) {
      const batch = await this.prisma.client.listing.findMany({
        where: { ...where, ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      for (const { id } of batch) {
        if (await this.apply(id, decision, now, rules)) done += 1;
      }
      if (batch.length < BATCH) return done;
      afterId = batch.at(-1)?.id;
    }
  }

  private apply(
    id: string,
    expected: Exclude<FreshnessDecision, null>,
    now: Date,
    rules: { freshnessDays: number; workingHours: { from: string; to: string } },
  ): Promise<boolean> {
    return this.prisma.client.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Listing" WHERE id = ${id}::uuid FOR UPDATE SKIP LOCKED`;
      if (locked.length === 0) return false;
      const l = await tx.listing.findUniqueOrThrow({ where: { id } });
      const decision = freshnessDecision(
        {
          status: l.status,
          lastConfirmedAt: l.lastConfirmedAt,
          freshnessRemindedAt: l.freshnessRemindedAt,
          availableTo: l.availableTo ? dateOnly(l.availableTo) : null,
        },
        now,
        rules,
      );
      if (decision !== expected) return false;
      const orgId = l.sellerOrgId;

      if (decision === 'REMIND' && l.lastConfirmedAt) {
        await tx.listing.update({ where: { id }, data: { freshnessRemindedAt: now } });
        await recordEvent(tx, 'listing.freshness_reminder', id, {
          listingId: id,
          orgId,
          dueAt: freshnessDueAt(l.lastConfirmedAt, rules.freshnessDays).toISOString(),
        });
        return true;
      }
      const next = nextListingState(l, decision === 'EXPIRE' ? 'EXPIRE' : 'AUTOPAUSE', {
        reservedKg: l.reservedKg.toString(),
      });
      await tx.listing.update({
        where: { id },
        data: { status: next.status, pauseReason: next.pauseReason },
      });
      await recordEvent(tx, 'listing.status_changed', id, {
        listingId: id,
        orgId,
        from: l.status,
        to: next.status,
        pauseReason: next.pauseReason,
        actorUserId: null,
      });
      if (decision === 'EXPIRE')
        await recordEvent(tx, 'listing.expired', id, { listingId: id, orgId });
      else {
        await recordEvent(tx, 'listing.auto_paused', id, {
          listingId: id,
          orgId,
          freshnessDays: rules.freshnessDays,
        });
      }
      return true;
    });
  }
}
