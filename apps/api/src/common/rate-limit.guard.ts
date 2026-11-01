import { DomainError, ErrorCode } from '@baliqbozor/domain';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { ENV, type Env } from '../config/env.js';
import { RedisService } from '../infra/redis.service.js';

const SKIP_RATE_LIMIT = 'skipRateLimit';
/** Не считать запросы к эндпоинту (health-пробы оркестратора). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT, true);

const WINDOW_SEC = 60;

/**
 * Глобальный лимит (SPEC 10.1): N запросов в минуту на пользователя, до входа — на IP.
 * Фиксированное окно в Redis. Если Redis недоступен — пропускаем (не роняем API).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limit = this.env.RATE_LIMIT_PER_MINUTE;
    if (limit === 0 || context.getType() !== 'http') return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const subject = req.auth ? `u:${req.auth.userId}` : `ip:${req.ip ?? 'unknown'}`;
    const window = Math.floor(Date.now() / 1000 / WINDOW_SEC);
    const key = `rl:${subject}:${String(window)}`;

    let count: number;
    try {
      const redis = await this.redis.ready();
      const [[, incr]] = (await redis
        .multi()
        .incr(key)
        .expire(key, WINDOW_SEC * 2)
        .exec()) as [[Error | null, number], [Error | null, number]];
      count = incr;
    } catch (err) {
      this.logger.warn(`Rate limit skipped: ${(err as Error).message}`);
      return true;
    }

    const retryAfterSec = (window + 1) * WINDOW_SEC - Math.floor(Date.now() / 1000);
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)));
    if (count > limit) {
      res.setHeader('Retry-After', String(retryAfterSec));
      throw new DomainError(ErrorCode.RATE_LIMITED, 'Too many requests', { retryAfterSec });
    }
    return true;
  }
}
