import { DomainError, ErrorCode, type PlatformRole } from '@baliqbozor/domain';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PrismaService } from '../../infra/prisma.service.js';
import { ORG_SCOPE, type OrgScopeOptions, PLATFORM_ROLES } from './access.decorators.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isStaff = (r: PlatformRole) => r === 'OPERATOR' || r === 'ADMIN';

/**
 * Второй и третий слои авторизации (SPEC 13.2): платформенная роль → членство в организации.
 * Выполняется после AuthGuard. Отказ по умолчанию — `FORBIDDEN`.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(
      PLATFORM_ROLES,
      targets,
    );
    const scope = this.reflector.getAllAndOverride<OrgScopeOptions | undefined>(ORG_SCOPE, targets);
    if (!roles && !scope) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.auth;
    if (!auth) throw new DomainError(ErrorCode.UNAUTHORIZED, 'Authentication required');

    if (roles && !roles.includes(auth.platformRole)) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Insufficient platform role');
    }
    if (!scope) return true;

    const header = req.headers['x-org-id'];
    const headerId = typeof header === 'string' && header !== '' ? header : undefined;
    const rawParam: unknown = scope.fromParam ? req.params[scope.fromParam] : undefined;
    const paramId = typeof rawParam === 'string' ? rawParam : undefined;
    if (headerId && paramId && headerId !== paramId) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        'X-Org-Id does not match the organization in the path',
      );
    }
    const orgId = paramId ?? headerId;
    if (!orgId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'X-Org-Id header is required', {
        fields: [{ field: 'X-Org-Id', constraints: ['isUuid'] }],
      });
    }
    if (!UUID.test(orgId)) throw new DomainError(ErrorCode.NOT_FOUND, 'Organization not found');

    const org = await this.prisma.client.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        type: true,
        verificationStatus: true,
        members: { where: { userId: auth.userId }, select: { role: true } },
      },
    });
    const role = org?.members[0]?.role ?? null;
    const staffAccess = !!scope.allowPlatformStaff && isStaff(auth.platformRole);
    if (!org || (!role && !staffAccess)) {
      // Чужая или несуществующая организация неразличимы для постороннего.
      throw new DomainError(ErrorCode.FORBIDDEN, 'Not a member of this organization');
    }
    if (scope.types && !scope.types.includes(org.type)) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Not allowed for this organization type');
    }
    if (role && scope.roles && !scope.roles.includes(role) && !staffAccess) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Insufficient organization role');
    }
    auth.org = { id: org.id, type: org.type, role, verificationStatus: org.verificationStatus };
    return true;
  }
}
