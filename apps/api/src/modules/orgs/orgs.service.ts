import { type Prisma } from '@baliqbozor/db';
import {
  assertCanChangeRole,
  assertCanRemoveMember,
  assertOrgFieldsEditable,
  DomainError,
  ErrorCode,
  invitationExpiry,
  isInvitationActive,
  type MemberRole,
  orgProfileIssues,
} from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import { fieldError, optionalPhone, requirePhone } from '../../common/phone.js';
import type { AuthContext } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { recordEvent } from '../../infra/events.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { assertCanInOrg, requireOrg } from '../auth/policy.js';
import { SettingsService } from '../settings/settings.service.js';
import type {
  CreateOrgDto,
  InvitationDto,
  InviteResultDto,
  MemberDto,
  MembersDto,
  OrgDto,
  UpdateOrgDto,
} from './orgs.dto.js';

const ORG_INCLUDE = {
  region: { select: { id: true, code: true, nameUz: true, nameRu: true } },
} as const;
type OrgRow = Prisma.OrganizationGetPayload<{ include: typeof ORG_INCLUDE }>;

const isStaff = (auth: AuthContext) =>
  auth.platformRole === 'OPERATOR' || auth.platformRole === 'ADMIN';

function toOrgDto(org: OrgRow, myRole: MemberRole | null, withPrivate: boolean): OrgDto {
  return {
    id: org.id,
    type: org.type,
    legalForm: org.legalForm,
    name: org.name,
    description: org.description,
    region: org.region,
    verificationStatus: org.verificationStatus,
    verifiedAt: org.verifiedAt,
    ratingAvg: org.ratingAvg?.toFixed(2) ?? null,
    ratingCount: org.ratingCount,
    reliabilityScore: org.reliabilityScore?.toFixed(2) ?? null,
    completedOrders: org.completedOrders,
    createdAt: org.createdAt,
    ...(withPrivate
      ? {
          private: {
            tin: org.tin,
            districtName: org.districtName,
            legalAddress: org.legalAddress,
            contactPhone: org.contactPhone,
            verificationNote: org.verificationNote,
            myRole,
          },
        }
      : {}),
  };
}

const toMemberDto = (m: {
  userId: string;
  role: MemberRole;
  createdAt: Date;
  user: { fullName: string | null; phone: string };
}): MemberDto => ({
  userId: m.userId,
  fullName: m.user.fullName,
  phone: m.user.phone,
  role: m.role,
  joinedAt: m.createdAt,
});

const toInvitationDto = (i: {
  id: string;
  phone: string;
  role: MemberRole;
  expiresAt: Date;
}): InvitationDto => ({
  id: i.id,
  phone: i.phone,
  role: i.role,
  expiresAt: i.expiresAt,
});

/** Организации и участники (SPEC 8.1, 9, 10.3). */
@Injectable()
export class OrgsService {
  /** Источник времени; в тестах подменяется. */
  clock: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  private async assertRegion(regionId: number | undefined): Promise<void> {
    if (regionId === undefined) return;
    const region = await this.prisma.client.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!region) throw fieldError('regionId', 'exists');
  }

  async create(auth: AuthContext, dto: CreateOrgDto): Promise<OrgDto> {
    if (orgProfileIssues({ legalForm: dto.legalForm, tin: dto.tin }).length > 0)
      throw fieldError('tin', 'isTin');
    await this.assertRegion(dto.regionId);
    const contactPhone = optionalPhone(dto.contactPhone, 'contactPhone');
    const org = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          type: dto.type,
          legalForm: dto.legalForm,
          name: dto.name.trim(),
          tin: dto.tin?.trim() || null,
          regionId: dto.regionId ?? null,
          districtName: dto.districtName ?? null,
          legalAddress: dto.legalAddress ?? null,
          description: dto.description ?? null,
          contactPhone: contactPhone ?? null,
          members: { create: { userId: auth.userId, role: 'OWNER' } },
        },
        include: ORG_INCLUDE,
      });
      await recordEvent(tx, 'org.created', created.id, {
        orgId: created.id,
        type: created.type,
        createdById: auth.userId,
      });
      await this.audit.record(tx, {
        action: 'org.create',
        entityType: 'Organization',
        entityId: created.id,
        after: dto,
      });
      return created;
    });
    return toOrgDto(org, 'OWNER', true);
  }

  /** Публичный профиль; приватные поля — членам, оператору и администратору. */
  async get(auth: AuthContext, orgId: string): Promise<OrgDto> {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
      include: {
        ...ORG_INCLUDE,
        members: { where: { userId: auth.userId }, select: { role: true } },
      },
    });
    if (!org) throw new DomainError(ErrorCode.NOT_FOUND, 'Organization not found');
    const myRole = org.members[0]?.role ?? null;
    return toOrgDto(org, myRole, myRole !== null || isStaff(auth));
  }

  async update(auth: AuthContext, dto: UpdateOrgDto): Promise<OrgDto> {
    assertCanInOrg(auth, 'ORG_EDIT');
    const orgId = requireOrg(auth).id;
    const fields = Object.keys(dto).filter(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );
    if (fields.length === 0) return this.get(auth, orgId);

    const current = await this.prisma.client.organization.findUniqueOrThrow({
      where: { id: orgId },
    });
    // ORG_EDIT уже ограничил круг: владелец или оператор/администратор (SPEC 9).
    assertOrgFieldsEditable(
      current.verificationStatus,
      fields,
      isStaff(auth) ? 'PLATFORM' : 'OWNER',
    );
    // СТИР проверяется, только когда меняются реквизиты (старые записи без СТИР не блокируют правку).
    if (dto.legalForm !== undefined || dto.tin !== undefined) {
      const legalForm = dto.legalForm ?? current.legalForm;
      const tin = dto.tin !== undefined ? dto.tin : current.tin;
      if (orgProfileIssues({ legalForm, tin }).length > 0) throw fieldError('tin', 'isTin');
    }
    await this.assertRegion(dto.regionId);
    const contactPhone = optionalPhone(dto.contactPhone, 'contactPhone');

    const data: Prisma.OrganizationUpdateInput = {
      ...(dto.legalForm ? { legalForm: dto.legalForm } : {}),
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.tin !== undefined ? { tin: dto.tin.trim() || null } : {}),
      ...(dto.regionId !== undefined ? { region: { connect: { id: dto.regionId } } } : {}),
      ...(dto.districtName !== undefined ? { districtName: dto.districtName } : {}),
      ...(dto.legalAddress !== undefined ? { legalAddress: dto.legalAddress } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(contactPhone !== undefined ? { contactPhone } : {}),
    };
    await this.prisma.client.$transaction(async (tx) => {
      const after = await tx.organization.update({ where: { id: orgId }, data });
      await recordEvent(tx, 'org.updated', orgId, { orgId, fields, actorUserId: auth.userId });
      await this.audit.record(tx, {
        action: 'org.update',
        entityType: 'Organization',
        entityId: orgId,
        before: Object.fromEntries(fields.map((f) => [f, (current as Record<string, unknown>)[f]])),
        after: Object.fromEntries(fields.map((f) => [f, (after as Record<string, unknown>)[f]])),
      });
    });
    return this.get(auth, orgId);
  }

  async members(auth: AuthContext): Promise<MembersDto> {
    assertCanInOrg(auth, 'MEMBERS_VIEW');
    const orgId = requireOrg(auth).id;
    const now = this.clock();
    const [members, invitations] = await Promise.all([
      this.prisma.client.membership.findMany({
        where: { orgId },
        include: { user: { select: { fullName: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.orgInvitation.findMany({
        where: { orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const canManage = auth.org?.role === 'OWNER' || isStaff(auth);
    return {
      members: members.map(toMemberDto),
      invitations: canManage ? invitations.map(toInvitationDto) : [],
    };
  }

  /** Приглашение по номеру: есть пользователь — сразу участник; нет — ожидающее приглашение (8.1). */
  async invite(auth: AuthContext, phoneInput: string, role: MemberRole): Promise<InviteResultDto> {
    assertCanInOrg(auth, 'MEMBERS_MANAGE');
    const orgId = requireOrg(auth).id;
    const phone = requirePhone(phoneInput);
    const now = this.clock();
    const ttlDays = await this.settings.get('org.invitationTtlDays');

    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { phone }, select: { id: true } });
      if (user) {
        const exists = await tx.membership.findUnique({
          where: { userId_orgId: { userId: user.id, orgId } },
        });
        if (exists)
          throw new DomainError(ErrorCode.CONFLICT, 'Already a member', {
            reason: 'ALREADY_MEMBER',
          });
        const member = await tx.membership.create({
          data: { orgId, userId: user.id, role },
          include: { user: { select: { fullName: true, phone: true } } },
        });
        await recordEvent(tx, 'org.member.added', orgId, {
          orgId,
          userId: user.id,
          role,
          byUserId: auth.userId,
        });
        await this.audit.record(tx, {
          action: 'org.member.add',
          entityType: 'Organization',
          entityId: orgId,
          after: { userId: user.id, role },
        });
        return { result: 'ADDED' as const, member: toMemberDto(member) };
      }
      const invitation = await tx.orgInvitation.upsert({
        where: { orgId_phone: { orgId, phone } },
        create: {
          orgId,
          phone,
          role,
          invitedById: auth.userId,
          expiresAt: invitationExpiry(now, ttlDays),
        },
        update: {
          role,
          invitedById: auth.userId,
          expiresAt: invitationExpiry(now, ttlDays),
          acceptedAt: null,
          revokedAt: null,
        },
      });
      await recordEvent(tx, 'org.member.invited', orgId, {
        orgId,
        invitationId: invitation.id,
        role,
        byUserId: auth.userId,
      });
      await this.audit.record(tx, {
        action: 'org.member.invite',
        entityType: 'Organization',
        entityId: orgId,
        after: { invitationId: invitation.id, role },
      });
      return { result: 'INVITED' as const, invitation: toInvitationDto(invitation) };
    });
  }

  async revokeInvitation(auth: AuthContext, invitationId: string): Promise<void> {
    assertCanInOrg(auth, 'MEMBERS_MANAGE');
    const orgId = requireOrg(auth).id;
    const now = this.clock();
    await this.prisma.client.$transaction(async (tx) => {
      const inv = await tx.orgInvitation.findFirst({ where: { id: invitationId, orgId } });
      if (!inv || !isInvitationActive(inv, now))
        throw new DomainError(ErrorCode.NOT_FOUND, 'Invitation not found');
      await tx.orgInvitation.update({ where: { id: inv.id }, data: { revokedAt: now } });
      await this.audit.record(tx, {
        action: 'org.invitation.revoke',
        entityType: 'Organization',
        entityId: orgId,
        after: { invitationId },
      });
    });
  }

  async changeRole(auth: AuthContext, userId: string, role: MemberRole): Promise<MemberDto> {
    assertCanInOrg(auth, 'MEMBERS_MANAGE');
    const orgId = requireOrg(auth).id;
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${orgId}::uuid FOR UPDATE`;
      const members = await tx.membership.findMany({
        where: { orgId },
        select: { userId: true, role: true },
      });
      assertCanChangeRole(members, userId, role);
      const before = members.find((m) => m.userId === userId)?.role;
      const member = await tx.membership.update({
        where: { userId_orgId: { userId, orgId } },
        data: { role },
        include: { user: { select: { fullName: true, phone: true } } },
      });
      await recordEvent(tx, 'org.member.role_changed', orgId, {
        orgId,
        userId,
        role,
        byUserId: auth.userId,
      });
      await this.audit.record(tx, {
        action: 'org.member.role',
        entityType: 'Organization',
        entityId: orgId,
        before: { userId, role: before },
        after: { userId, role },
      });
      return toMemberDto(member);
    });
  }

  async removeMember(auth: AuthContext, userId: string): Promise<void> {
    assertCanInOrg(auth, 'MEMBERS_MANAGE');
    const orgId = requireOrg(auth).id;
    await this.prisma.client.$transaction(async (tx) => {
      // Блокировка организации: два параллельных удаления не оставят её без владельца.
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${orgId}::uuid FOR UPDATE`;
      const members = await tx.membership.findMany({
        where: { orgId },
        select: { userId: true, role: true },
      });
      assertCanRemoveMember(members, userId);
      await tx.membership.delete({ where: { userId_orgId: { userId, orgId } } });
      await recordEvent(tx, 'org.member.removed', orgId, { orgId, userId, byUserId: auth.userId });
      await this.audit.record(tx, {
        action: 'org.member.remove',
        entityType: 'Organization',
        entityId: orgId,
        before: { userId },
      });
    });
  }
}
