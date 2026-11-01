/** Сессия, найденная по хэшу refresh-токена (SPEC 13.2). */
export interface RefreshSessionState {
  revokedAt: Date | null;
  expiresAt: Date;
  userActive: boolean;
}

/**
 * Что делать с предъявленным refresh-токеном:
 * - ROTATE — выдать новую пару, текущую сессию отозвать, цепочку (`familyId`) продолжить;
 * - REUSE_DETECTED — токен уже был использован или отозван: отозвать всю цепочку;
 * - INVALID — неизвестен, истёк или пользователь заблокирован.
 */
export type RefreshDecision = 'ROTATE' | 'REUSE_DETECTED' | 'INVALID';

export function classifyRefresh(session: RefreshSessionState | null, now: Date): RefreshDecision {
  if (!session) return 'INVALID';
  if (session.revokedAt) return 'REUSE_DETECTED';
  if (session.expiresAt <= now || !session.userActive) return 'INVALID';
  return 'ROTATE';
}

export function refreshExpiry(now: Date, ttlDays: number): Date {
  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}
