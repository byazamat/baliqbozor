import { randomBytes, createHash } from 'node:crypto';

import type { PlatformRole } from '@baliqbozor/domain';
import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';

import { ENV, type Env } from '../../config/env.js';

export interface AccessClaims {
  userId: string;
  sessionId: string;
  platformRole: PlatformRole;
}

const ISSUER = 'baliqbozor-api';
const encoder = new TextEncoder();

/** Access JWT (HS256, два ключа для ротации) и refresh-токены (случайные, в БД — SHA-256). */
@Injectable()
export class TokenService {
  private readonly current: Uint8Array;
  private readonly previous: Uint8Array | undefined;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.current = encoder.encode(env.JWT_ACCESS_SECRET);
    this.previous = env.JWT_ACCESS_SECRET_PREVIOUS
      ? encoder.encode(env.JWT_ACCESS_SECRET_PREVIOUS)
      : undefined;
  }

  get accessTtlSec(): number {
    return this.env.JWT_ACCESS_TTL;
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId, role: claims.platformRole })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${String(this.env.JWT_ACCESS_TTL)}s`)
      .sign(this.current);
  }

  /** Проверка подписи текущим или предыдущим ключом; `null` — недействителен. */
  async verifyAccess(token: string): Promise<AccessClaims | null> {
    for (const key of [this.current, this.previous]) {
      if (!key) continue;
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'] });
        const { sub, sid, role } = payload as { sub?: unknown; sid?: unknown; role?: unknown };
        if (typeof sub === 'string' && typeof sid === 'string' && typeof role === 'string') {
          return { userId: sub, sessionId: sid, platformRole: role as PlatformRole };
        }
        return null;
      } catch {
        // попробовать следующий ключ
      }
    }
    return null;
  }

  newRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
