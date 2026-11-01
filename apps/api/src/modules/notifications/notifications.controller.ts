import { DomainError, ErrorCode } from '@baliqbozor/domain';
import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import { afterCursor, DEFAULT_PAGE_SIZE, PAGE_ORDER, toPage } from '../../common/pagination.js';
import type { AuthContext } from '../../common/request-context.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import {
  NotificationDto,
  NotificationPageDto,
  NotificationsQueryDto,
  ReadAllResultDto,
} from './notifications.dto.js';

/** In-app уведомления пользователя (SPEC 10.3). Создаёт их только worker по outbox. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOkResponse({ type: NotificationPageDto })
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: NotificationsQueryDto,
  ): Promise<NotificationPageDto> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const own = { userId: auth.userId, channel: 'IN_APP' as const };
    const [rows, unreadCount] = await Promise.all([
      this.prisma.client.notification.findMany({
        where: {
          ...own,
          ...(query.unreadOnly ? { readAt: null } : {}),
          ...afterCursor(query.cursor),
        },
        orderBy: PAGE_ORDER,
        take: limit + 1,
      }),
      this.prisma.client.notification.count({ where: { ...own, readAt: null } }),
    ]);
    const page = toPage(rows, limit);
    return {
      items: page.items.map((n): NotificationDto => ({
        id: n.id,
        eventType: n.eventType,
        title: n.title,
        body: n.body,
        data: (n.data as Record<string, unknown> | null) ?? null,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      nextCursor: page.nextCursor,
      unreadCount,
    };
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOkResponse({ type: ReadAllResultDto })
  async readAll(@CurrentAuth() auth: AuthContext): Promise<ReadAllResultDto> {
    const res = await this.prisma.client.notification.updateMany({
      where: { userId: auth.userId, channel: 'IN_APP', readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    return { updated: res.count };
  }

  @Post(':id/read')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async read(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const n = await this.prisma.client.notification.findFirst({
      where: { id, userId: auth.userId },
      select: { readAt: true },
    });
    if (!n) throw new DomainError(ErrorCode.NOT_FOUND, 'Notification not found');
    if (!n.readAt) {
      await this.prisma.client.notification.update({
        where: { id },
        data: { readAt: new Date(), status: 'READ' },
      });
    }
  }
}
