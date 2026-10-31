import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/prisma.service.js';
import { RedisService } from '../../infra/redis.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../providers/storage/storage.provider.js';
import type { HealthDto, ReadinessCheckDto, ReadinessDto } from './health.dto.js';

export const READINESS_TIMEOUT_MS = 2000;

async function probe(check: (signal: AbortSignal) => Promise<void>): Promise<ReadinessCheckDto> {
  const started = performance.now();
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('timeout'));
    }, READINESS_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(controller.signal), timeout]);
    return { status: 'up', latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - started),
      error: err instanceof Error ? (err.name === 'Error' ? err.message : err.name) : 'unknown',
    };
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  liveness(): HealthDto {
    return {
      status: 'ok',
      service: 'api',
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessDto> {
    const [database, redis, storage] = await Promise.all([
      probe(() => this.prisma.ping()),
      probe(() => this.redis.ping()),
      probe((signal) => this.storage.checkHealth(signal)),
    ]);
    const ok = [database, redis, storage].every((c) => c.status === 'up');
    return { status: ok ? 'ok' : 'error', checks: { database, redis, storage } };
  }
}
