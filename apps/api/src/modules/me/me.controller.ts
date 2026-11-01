import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { AuthContext } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { MeDto, UpdateMeDto } from './me.dto.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeDto, description: 'Профиль и организации с ролями (SPEC 10.3)' })
  async me(@CurrentAuth() auth: AuthContext): Promise<MeDto> {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: {
        memberships: {
          include: {
            org: { select: { id: true, name: true, type: true, verificationStatus: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: user.id,
      phone: user.phone,
      fullName: user.fullName,
      locale: user.locale,
      platformRole: user.platformRole,
      organizations: user.memberships.map((m) => ({ ...m.org, role: m.role })),
    };
  }

  @Patch()
  @ApiOkResponse({ type: MeDto })
  async update(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateMeDto): Promise<MeDto> {
    await this.prisma.client.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: auth.userId },
        select: { fullName: true, locale: true },
      });
      const after = await tx.user.update({
        where: { id: auth.userId },
        data: {
          ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
          ...(dto.locale ? { locale: dto.locale } : {}),
        },
        select: { fullName: true, locale: true },
      });
      await this.audit.record(tx, {
        action: 'user.update',
        entityType: 'User',
        entityId: auth.userId,
        before,
        after,
      });
    });
    return this.me(auth);
  }
}
