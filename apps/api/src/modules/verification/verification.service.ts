import { type Prisma, type TransactionClient } from '@baliqbozor/db';
import {
  DomainError,
  ErrorCode,
  nextVerificationStatus,
  type VerificationAction,
} from '@baliqbozor/domain';
import { Injectable } from '@nestjs/common';

import { afterCursor, DEFAULT_PAGE_SIZE, PAGE_ORDER, toPage } from '../../common/pagination.js';
import type { AuthContext } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { recordEvent } from '../../infra/events.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { assertCanInOrg, requireOrg } from '../auth/policy.js';
import { OrgsService } from '../orgs/orgs.service.js';
import type {
  AdminOrgDetailsDto,
  AdminOrgRowPageDto,
  AdminOrgsQueryDto,
  OpsTaskDto,
  OpsTaskPageDto,
  TasksQueryDto,
  UpdateTaskDto,
} from './verification.dto.js';

const toTaskDto = (t: Prisma.OpsTaskGetPayload<object>): OpsTaskDto => ({
  id: t.id,
  type: t.type,
  title: t.title,
  description: t.description,
  status: t.status,
  orgId: t.orgId,
  assigneeId: t.assigneeId,
  dueAt: t.dueAt,
  createdAt: t.createdAt,
});

/** Верификация организаций (SPEC 8.1, 8.19, 10.3 admin): отправка владельцем и решение оператора. */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrgsService,
  ) {}

  /** `POST /orgs/:id/verification`: документы организации → `PENDING` + задача `VERIFY_ORG`. */
  async submit(auth: AuthContext, mediaIds: string[], note: string | undefined) {
    assertCanInOrg(auth, 'ORG_SUBMIT_VERIFICATION');
    const orgId = requireOrg(auth).id;
    const ids = [...new Set(mediaIds)];
    return this.prisma.client.$transaction(async (tx) => {
      const org = await this.lockOrg(tx, orgId);
      const next = nextVerificationStatus(org.verificationStatus, 'SUBMIT', {
        orgType: org.type,
        wasVerified: !!org.verifiedAt,
      });
      const media = await tx.mediaFile.findMany({
        where: { id: { in: ids }, orgId, status: { in: ['UPLOADED', 'PROCESSED'] } },
        select: { id: true },
      });
      if (media.length !== ids.length) {
        throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Unknown or not uploaded documents', {
          fields: [{ field: 'mediaIds', constraints: ['uploadedOrgMedia'] }],
        });
      }
      await tx.organization.update({
        where: { id: orgId },
        data: { verificationStatus: next, verificationNote: null },
      });
      const task = await tx.opsTask.create({
        data: {
          type: 'VERIFY_ORG',
          title: `Verify organization: ${org.name}`,
          description: note ?? null,
          orgId,
          createdById: null,
        },
      });
      await recordEvent(tx, 'org.verification.submitted', orgId, {
        orgId,
        mediaIds: ids,
        taskId: task.id,
      });
      await recordEvent(tx, 'ops.task.created', task.id, {
        taskId: task.id,
        type: task.type,
        orgId,
      });
      await this.audit.record(tx, {
        action: 'org.verification.submit',
        entityType: 'Organization',
        entityId: orgId,
        before: { status: org.verificationStatus },
        after: { status: next, mediaIds: ids, taskId: task.id },
      });
      return { status: next, taskId: task.id };
    });
  }

  /** Решение оператора: VERIFY / REJECT / SUSPEND / UNSUSPEND (SPEC 8.1, D-39). */
  async decide(
    auth: AuthContext,
    orgId: string,
    action: Exclude<VerificationAction, 'SUBMIT'>,
    note: string | undefined,
  ) {
    const result = await this.prisma.client.$transaction(async (tx) => {
      const org = await this.lockOrg(tx, orgId);
      const next = nextVerificationStatus(org.verificationStatus, action, {
        orgType: org.type,
        wasVerified: !!org.verifiedAt,
      });
      const data: Prisma.OrganizationUpdateInput = { verificationStatus: next };
      if (action === 'APPROVE')
        Object.assign(data, {
          verifiedAt: new Date(),
          verifiedById: auth.userId,
          verificationNote: note ?? null,
        });
      if (action === 'REJECT') Object.assign(data, { verificationNote: note ?? null });
      await tx.organization.update({ where: { id: orgId }, data });

      if (action === 'APPROVE' || action === 'REJECT') {
        await tx.opsTask.updateMany({
          where: { orgId, type: 'VERIFY_ORG', status: 'OPEN' },
          data: { status: 'DONE' },
        });
      }
      if (action === 'APPROVE')
        await recordEvent(tx, 'org.verification.approved', orgId, {
          orgId,
          operatorId: auth.userId,
        });
      if (action === 'REJECT') {
        await recordEvent(tx, 'org.verification.rejected', orgId, {
          orgId,
          operatorId: auth.userId,
          note: note ?? '',
        });
      }
      if (action === 'SUSPEND') {
        await recordEvent(tx, 'org.suspended', orgId, {
          orgId,
          operatorId: auth.userId,
          previousStatus: org.verificationStatus,
        });
      }
      if (action === 'UNSUSPEND')
        await recordEvent(tx, 'org.unsuspended', orgId, {
          orgId,
          operatorId: auth.userId,
          status: next,
        });
      await this.audit.record(tx, {
        action: `org.${action.toLowerCase()}`,
        entityType: 'Organization',
        entityId: orgId,
        before: { status: org.verificationStatus },
        after: { status: next, note: note ?? null },
      });
      return next;
    });
    return { status: result };
  }

  async listOrgs(query: AdminOrgsQueryDto): Promise<AdminOrgRowPageDto> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const q = query.q?.trim();
    const digits = q?.replace(/\D/g, '') ?? '';
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { verificationStatus: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              ...(digits.length >= 3
                ? [
                    { tin: { contains: digits } },
                    { members: { some: { user: { phone: { contains: digits } } } } },
                  ]
                : []),
            ],
          }
        : {}),
      ...afterCursor(query.cursor),
    };
    const rows = await this.prisma.client.organization.findMany({
      where,
      orderBy: PAGE_ORDER,
      take: limit + 1,
      include: { region: { select: { nameRu: true, nameUz: true } } },
    });
    const page = toPage(rows, limit);
    return {
      items: page.items.map((o) => ({
        id: o.id,
        name: o.name,
        type: o.type,
        verificationStatus: o.verificationStatus,
        tin: o.tin,
        regionNameRu: o.region?.nameRu ?? null,
        regionNameUz: o.region?.nameUz ?? null,
        createdAt: o.createdAt,
      })),
      nextCursor: page.nextCursor,
    };
  }

  async orgDetails(auth: AuthContext, orgId: string): Promise<AdminOrgDetailsDto> {
    const org = await this.orgs.get(auth, orgId);
    const [members, documents, tasks] = await Promise.all([
      this.prisma.client.membership.findMany({
        where: { orgId },
        include: { user: { select: { fullName: true, phone: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.mediaFile.findMany({
        where: { orgId, status: { in: ['UPLOADED', 'PROCESSED'] } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.opsTask.findMany({
        where: { orgId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      org,
      members: members.map((m) => ({
        userId: m.userId,
        fullName: m.user.fullName,
        phone: m.user.phone,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        status: d.status,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt,
      })),
      tasks: tasks.map(toTaskDto),
    };
  }

  async listTasks(query: TasksQueryDto): Promise<OpsTaskPageDto> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.client.opsTask.findMany({
      where: {
        status: query.status ?? 'OPEN',
        ...(query.type ? { type: query.type } : {}),
        ...afterCursor(query.cursor),
      },
      orderBy: PAGE_ORDER,
      take: limit + 1,
    });
    const page = toPage(rows, limit);
    return { items: page.items.map(toTaskDto), nextCursor: page.nextCursor };
  }

  async updateTask(taskId: string, dto: UpdateTaskDto): Promise<OpsTaskDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const task = await tx.opsTask.findUnique({ where: { id: taskId } });
      if (!task) throw new DomainError(ErrorCode.NOT_FOUND, 'Task not found');
      if (dto.assigneeId) {
        const assignee = await tx.user.findUnique({
          where: { id: dto.assigneeId },
          select: { platformRole: true },
        });
        if (!assignee || assignee.platformRole === 'USER') {
          throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Assignee must be an operator', {
            fields: [{ field: 'assigneeId', constraints: ['isOperator'] }],
          });
        }
      }
      const updated = await tx.opsTask.update({
        where: { id: taskId },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        },
      });
      await this.audit.record(tx, {
        action: 'ops.task.update',
        entityType: 'OpsTask',
        entityId: taskId,
        before: toTaskDto(task),
        after: toTaskDto(updated),
      });
      return toTaskDto(updated);
    });
  }

  /** Строка организации под блокировкой: параллельные решения не перепишут друг друга. */
  private async lockOrg(tx: TransactionClient, orgId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${orgId}::uuid FOR UPDATE`;
    const org = await tx.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new DomainError(ErrorCode.NOT_FOUND, 'Organization not found');
    return org;
  }
}
