import type { MemberRole, OrgType, PlatformRole, VerificationStatus } from '@baliqbozor/domain';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { type FakeSms, loginAs, type Session } from './auth-helpers.js';
import { prismaOf } from './db.js';

let phoneSeq = 0;
/** Уникальный номер для теста: +99890 0xx xx xx. */
export function nextPhone(): string {
  phoneSeq += 1;
  return `+99890${String(phoneSeq).padStart(7, '0')}`;
}

export interface Actor extends Session {
  phone: string;
}

/** Пользователь с входом; при необходимости — с платформенной ролью. */
export async function actor(
  app: INestApplication,
  sms: FakeSms,
  platformRole: PlatformRole = 'USER',
): Promise<Actor> {
  const phone = nextPhone();
  const session = await loginAs(app, sms, phone);
  if (platformRole !== 'USER') {
    await prismaOf(app).user.update({ where: { id: session.userId }, data: { platformRole } });
  }
  return { ...session, phone };
}

export async function createOrg(
  app: INestApplication,
  ownerId: string,
  options: { type?: OrgType; status?: VerificationStatus; name?: string } = {},
) {
  return prismaOf(app).organization.create({
    data: {
      type: options.type ?? 'SELLER',
      legalForm: 'LLC',
      name: options.name ?? 'Test Org',
      verificationStatus: options.status ?? 'UNVERIFIED',
      members: { create: { userId: ownerId, role: 'OWNER' } },
    },
  });
}

export async function addMember(
  app: INestApplication,
  orgId: string,
  userId: string,
  role: MemberRole,
) {
  return prismaOf(app).membership.create({ data: { orgId, userId, role } });
}

/**
 * Изоляция (CLAUDE.md): запрос постороннего к ресурсу чужой организации отклоняется (403/404)
 * и не раскрывает данных.
 */
export async function expectIsolated(response: request.Test): Promise<void> {
  const res = await response;
  if (![403, 404].includes(res.status)) {
    throw new Error(
      `Expected 403/404 for an outsider, got ${String(res.status)}: ${JSON.stringify(res.body)}`,
    );
  }
  if (!('error' in (res.body as object))) throw new Error('Expected an error body');
}
