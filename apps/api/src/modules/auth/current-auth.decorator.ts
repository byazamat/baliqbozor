import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthContext } from '../../common/request-context.js';

/** Контекст аутентифицированного пользователя (после AuthGuard). */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const auth = ctx.switchToHttp().getRequest<Request>().auth;
    if (!auth) throw new Error('CurrentAuth used on a public route without authentication');
    return auth;
  },
);
