import {
  DomainError,
  ErrorCode,
  parseSetting,
  resolveSettings,
  type SettingKey,
  type SettingsSnapshot,
  type SettingValue,
} from '@baliqbozor/domain';
import { Injectable, Logger } from '@nestjs/common';

import { toJsonValue } from '../../common/json-value.js';
import { currentAuth } from '../../common/request-context.js';
import { AuditService } from '../../infra/audit.service.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { RedisService } from '../../infra/redis.service.js';

export const SETTINGS_CACHE_KEY = 'settings:v1';
const CACHE_TTL_SEC = 300;

/** Настройки платформы (SPEC 8.13): БД + кэш Redis; изменение — с аудитом и сбросом кэша. */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async all(): Promise<SettingsSnapshot> {
    const cached = await this.readCache();
    if (cached) return cached;
    const rows = await this.prisma.client.setting.findMany();
    const { values, invalidKeys } = resolveSettings(new Map(rows.map((r) => [r.key, r.value])));
    if (invalidKeys.length > 0) {
      this.logger.warn(`Invalid stored settings ignored: ${invalidKeys.join(', ')}`);
    }
    await this.writeCache(values);
    return values;
  }

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return (await this.all())[key];
  }

  async update<K extends SettingKey>(key: K, value: unknown): Promise<SettingValue<K>> {
    const parsed = parseSetting(key, value);
    if (!parsed.ok) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid setting value', {
        key,
        issues: parsed.issues,
      });
    }
    const before = (await this.all())[key];
    await this.prisma.client.$transaction(async (tx) => {
      const actorId = currentAuth()?.userId ?? null;
      const json = toJsonValue(parsed.value);
      await tx.setting.upsert({
        where: { key },
        create: { key, value: json, updatedById: actorId },
        update: { value: json, updatedById: actorId },
      });
      await this.audit.record(tx, {
        action: 'settings.update',
        entityType: 'Setting',
        entityId: key,
        before,
        after: parsed.value,
      });
    });
    await this.invalidate();
    return parsed.value;
  }

  async invalidate(): Promise<void> {
    try {
      await (await this.redis.ready()).del(SETTINGS_CACHE_KEY);
    } catch (err) {
      this.logger.warn(`Settings cache invalidation failed: ${(err as Error).message}`);
    }
  }

  private async readCache(): Promise<SettingsSnapshot | null> {
    try {
      const raw = await (await this.redis.ready()).get(SETTINGS_CACHE_KEY);
      return raw ? (JSON.parse(raw) as SettingsSnapshot) : null;
    } catch {
      return null; // Redis недоступен — читаем БД.
    }
  }

  private async writeCache(values: SettingsSnapshot): Promise<void> {
    try {
      await (
        await this.redis.ready()
      ).set(SETTINGS_CACHE_KEY, JSON.stringify(values), 'EX', CACHE_TTL_SEC);
    } catch {
      // Кэш необязателен.
    }
  }
}
