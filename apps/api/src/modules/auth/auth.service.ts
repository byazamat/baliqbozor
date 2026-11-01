import { randomInt, randomUUID } from 'node:crypto';

import { type TransactionClient } from '@baliqbozor/db';
import {
  assertOtpRequestAllowed,
  checkOtp,
  classifyRefresh,
  decideOtpRequest,
  DomainError,
  ErrorCode,
  generateOtpCode,
  isInvitationActive,
  normalizeUzPhone,
  type OtpPolicy,
  type PlatformRole,
  refreshExpiry,
} from '@baliqbozor/domain';
import { type Locale, translate } from '@baliqbozor/i18n';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

import { ENV, type Env } from '../../config/env.js';
import { AuditService } from '../../infra/audit.service.js';
import { recordEvent } from '../../infra/events.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { RedisService } from '../../infra/redis.service.js';
import { SMS_PROVIDER, type SmsProvider } from '../../providers/sms/sms.provider.js';
import { SettingsService } from '../settings/settings.service.js';
import { TokenService } from './token.service.js';

export interface ClientInfo {
  ip: string | undefined;
  userAgent: string | undefined;
  locale: Locale;
}

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string | null;
  locale: Locale;
  platformRole: PlatformRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

const HOUR_MS = 3_600_000;
const blockKey = (phone: string) => `otp:block:${phone}`;

function requirePhone(input: string): string {
  const phone = normalizeUzPhone(input);
  if (!phone) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid phone', {
      fields: [{ field: 'phone', constraints: ['isUzPhone'] }],
    });
  }
  return phone;
}

const toAuthUser = (u: {
  id: string;
  phone: string;
  fullName: string | null;
  locale: Locale;
  platformRole: PlatformRole;
}): AuthUser => ({
  id: u.id,
  phone: u.phone,
  fullName: u.fullName,
  locale: u.locale,
  platformRole: u.platformRole,
});

/** Вход по SMS-коду, сессии и ротация refresh-токенов (SPEC 8.1, 10.3, 13.2, D-41). */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Источник времени; в тестах подменяется. */
  clock: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async otpPolicy(): Promise<OtpPolicy> {
    const s = await this.settings.all();
    return {
      ttlSeconds: s['otp.ttlSeconds'],
      maxAttempts: s['otp.maxAttempts'],
      resendCooldownSeconds: s['otp.resendCooldownSeconds'],
      maxPerPhonePerHour: s['otp.maxPerPhonePerHour'],
      maxPerIpPerHour: s['otp.maxPerIpPerHour'],
      blockMinutes: s['otp.blockMinutes'],
    };
  }

  /** `POST /auth/otp/request`: одинаковый ответ для любых номеров. */
  async requestOtp(phoneInput: string, client: ClientInfo): Promise<{ resendAfterSec: number }> {
    const phone = requirePhone(phoneInput);
    const now = this.clock();
    const policy = await this.otpPolicy();
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const db = this.prisma.client;

    const [last, sentToPhoneLastHour, sentFromIpLastHour, blockedUntil] = await Promise.all([
      db.otpCode.findFirst({
        where: { phone },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      db.otpCode.count({ where: { phone, createdAt: { gt: hourAgo } } }),
      client.ip ? db.otpCode.count({ where: { ip: client.ip, createdAt: { gt: hourAgo } } }) : 0,
      this.readBlock(phone),
    ]);

    const decision = decideOtpRequest(
      {
        now,
        lastSentAt: last?.createdAt ?? null,
        sentToPhoneLastHour,
        sentFromIpLastHour,
        blockedUntil,
      },
      policy,
    );
    if (!decision.allowed && decision.blockUntil)
      await this.writeBlock(phone, decision.blockUntil, now);
    assertOtpRequestAllowed(decision);

    const code = generateOtpCode(randomInt);
    await db.otpCode.create({
      data: {
        phone,
        purpose: 'LOGIN',
        codeHash: await hash(code),
        expiresAt: decision.expiresAt,
        ip: client.ip ?? null,
        // Окна лимитов считаются по часам сервиса, а не БД.
        createdAt: now,
      },
    });
    const text = translate(client.locale, 'auth.otpSms', { brand: this.env.BRAND_NAME, code });
    await this.sms.send(phone, text);
    return { resendAfterSec: decision.resendAfterSec };
  }

  /** `POST /auth/otp/verify`: проверка кода, создание пользователя при первом входе, новая сессия. */
  async verifyOtp(
    phoneInput: string,
    code: string,
    client: ClientInfo,
  ): Promise<TokenPair & { user: AuthUser; isNewUser: boolean }> {
    const phone = requirePhone(phoneInput);
    const now = this.clock();
    const policy = await this.otpPolicy();
    const db = this.prisma.client;

    const otp = await db.otpCode.findFirst({
      where: { phone, purpose: 'LOGIN', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const bypass =
      this.env.APP_ENV === 'local' &&
      !!this.env.OTP_DEV_BYPASS_CODE &&
      code === this.env.OTP_DEV_BYPASS_CODE;
    const matches = !!otp && (bypass || (await verify(otp.codeHash, code).catch(() => false)));
    const check = checkOtp(otp, matches, now, policy);
    if (!check.ok) {
      if (check.countAttempt && otp) {
        await db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      }
      throw new DomainError(check.code, 'OTP check failed');
    }

    return db.$transaction(async (tx) => {
      // Защита от двойного использования одного кода при параллельных запросах.
      const consumed = await tx.otpCode.updateMany({
        where: { id: otp?.id ?? '', consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count === 0) throw new DomainError(ErrorCode.OTP_EXPIRED, 'OTP already used');

      const existing = await tx.user.findUnique({ where: { phone } });
      if (existing?.status === 'BLOCKED') {
        throw new DomainError(ErrorCode.FORBIDDEN, 'User is blocked', { reason: 'USER_BLOCKED' });
      }
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { lastLoginAt: now } })
        : await tx.user.create({ data: { phone, locale: client.locale, lastLoginAt: now } });
      if (!existing) await recordEvent(tx, 'user.registered', user.id, { userId: user.id });
      await this.acceptInvitations(tx, user.id, phone, now);

      const pair = await this.createSession(
        tx,
        user.id,
        user.platformRole,
        randomUUID(),
        client,
        now,
      );
      await this.audit.record(tx, {
        action: existing ? 'auth.login' : 'auth.register',
        entityType: 'User',
        entityId: user.id,
        actor: { userId: user.id, role: user.platformRole },
      });
      return { ...pair, user: toAuthUser(user), isNewUser: !existing };
    });
  }

  /** `POST /auth/refresh`: ротация; повторное использование отзывает всю цепочку. */
  async refresh(refreshToken: string, client: ClientInfo): Promise<TokenPair> {
    const now = this.clock();
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);
    return this.prisma.client
      .$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Session" WHERE "refreshTokenHash" = ${tokenHash} FOR UPDATE`;
        const session = rows[0]
          ? await tx.session.findUnique({ where: { id: rows[0].id }, include: { user: true } })
          : null;
        const decision = classifyRefresh(
          session && {
            revokedAt: session.revokedAt,
            expiresAt: session.expiresAt,
            userActive: session.user.status === 'ACTIVE',
          },
          now,
        );
        if (decision === 'REUSE_DETECTED' && session) {
          await tx.session.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          this.logger.warn(
            `Refresh token reuse detected, session family ${session.familyId} revoked`,
          );
          return null;
        }
        if (decision !== 'ROTATE' || !session) return null;
        await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } });
        return this.createSession(
          tx,
          session.userId,
          session.user.platformRole,
          session.familyId,
          client,
          now,
        );
      })
      .then((pair) => {
        if (!pair) throw new DomainError(ErrorCode.UNAUTHORIZED, 'Invalid refresh token');
        return pair;
      });
  }

  /** `POST /auth/logout`: отзыв текущей сессии. */
  async logout(sessionId: string): Promise<void> {
    await this.prisma.client.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock() },
    });
  }

  private async createSession(
    tx: TransactionClient,
    userId: string,
    platformRole: PlatformRole,
    familyId: string,
    client: ClientInfo,
    now: Date,
  ): Promise<TokenPair> {
    const refreshToken = this.tokens.newRefreshToken();
    const session = await tx.session.create({
      data: {
        userId,
        familyId,
        refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
        userAgent: client.userAgent?.slice(0, 500) ?? null,
        ip: client.ip ?? null,
        expiresAt: refreshExpiry(now, this.env.REFRESH_TTL_DAYS),
      },
    });
    const accessToken = await this.tokens.signAccess({
      userId,
      sessionId: session.id,
      platformRole,
    });
    return { accessToken, refreshToken, accessTokenExpiresIn: this.tokens.accessTtlSec };
  }

  /** Ожидающие приглашения на этот номер превращаются в членство (SPEC 8.1, D-11). */
  private async acceptInvitations(tx: TransactionClient, userId: string, phone: string, now: Date) {
    const invitations = await tx.orgInvitation.findMany({
      where: { phone, acceptedAt: null, revokedAt: null },
    });
    for (const inv of invitations) {
      if (!isInvitationActive(inv, now)) continue;
      const exists = await tx.membership.findUnique({
        where: { userId_orgId: { userId, orgId: inv.orgId } },
      });
      if (!exists) {
        await tx.membership.create({ data: { userId, orgId: inv.orgId, role: inv.role } });
        await recordEvent(tx, 'org.member.added', inv.orgId, {
          orgId: inv.orgId,
          userId,
          role: inv.role,
          byUserId: inv.invitedById,
        });
      }
      await tx.orgInvitation.update({ where: { id: inv.id }, data: { acceptedAt: now } });
    }
  }

  private async readBlock(phone: string): Promise<Date | null> {
    try {
      const value = await (await this.redis.ready()).get(blockKey(phone));
      return value ? new Date(Number(value)) : null;
    } catch {
      return null;
    }
  }

  private async writeBlock(phone: string, until: Date, now: Date): Promise<void> {
    try {
      const ttl = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));
      await (await this.redis.ready()).set(blockKey(phone), String(until.getTime()), 'EX', ttl);
    } catch (err) {
      this.logger.warn(`Cannot store OTP block: ${(err as Error).message}`);
    }
  }
}
