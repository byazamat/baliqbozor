import { AsyncLocalStorage } from 'node:async_hooks';

import type { MemberRole, OrgType, PlatformRole, VerificationStatus } from '@baliqbozor/domain';
import type { NextFunction, Request, Response } from 'express';

/** Кто выполняет запрос — заполняется guard'ом аутентификации (M1.4). */
export interface AuthContext {
  userId: string;
  platformRole: PlatformRole;
  sessionId: string;
  /**
   * Текущая организация из `X-Org-Id` (или пути), если запрос на уровне организации.
   * `role: null` — доступ оператора/администратора без членства.
   */
  org?:
    | { id: string; type: OrgType; role: MemberRole | null; verificationStatus: VerificationStatus }
    | undefined;
  /** Оператор, действующий «от имени» (SPEC 9), — для аудита. */
  impersonatorId?: string | undefined;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- штатное расширение типов Express
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export interface RequestContext {
  req: Request;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Middleware: делает текущий запрос доступным сервисам (аудит, логи) без протаскивания через параметры. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ req }, next);
}

export function currentRequest(): Request | undefined {
  return storage.getStore()?.req;
}

export function currentAuth(): AuthContext | undefined {
  return currentRequest()?.auth;
}

/** Выполнить код в контексте запроса — для тестов и фоновых вызовов из HTTP-обработчиков. */
export function runWithRequest<T>(req: Request, fn: () => T): T {
  return storage.run({ req }, fn);
}
