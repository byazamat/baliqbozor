import { DomainError, ErrorCode } from '@baliqbozor/domain';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PrismaService } from '../../infra/prisma.service.js';
import { IS_PUBLIC } from './public.decorator.js';
import { TokenService } from './token.service.js';

/**
 * Глобальная аутентификация (SPEC 13.2): Bearer access JWT + живая сессия + активный пользователь.
 * Сессия проверяется на каждом запросе — выход и блокировка действуют сразу (D-41).
 * Отказ по умолчанию; открытые эндпоинты помечены `@Public()` (на них токен разбирается, если есть).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];

    if (!token) {
      if (isPublic) return true;
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Authentication required');
    }
    const claims = await this.tokens.verifyAccess(token);
    const session = claims
      ? await this.prisma.client.session.findUnique({
          where: { id: claims.sessionId },
          select: {
            userId: true,
            revokedAt: true,
            expiresAt: true,
            user: { select: { status: true, platformRole: true } },
          },
        })
      : null;
    const valid =
      !!claims &&
      !!session &&
      session.userId === claims.userId &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.user.status === 'ACTIVE';
    if (!valid) {
      if (isPublic) return true;
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Invalid or expired token');
    }
    // Роль берём из БД: смена платформенной роли действует сразу, а не после истечения токена.
    req.auth = {
      userId: claims.userId,
      sessionId: claims.sessionId,
      platformRole: session.user.platformRole,
    };
    return true;
  }
}
