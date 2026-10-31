import type { Server } from 'node:http';

import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';

import { ENV, type Env } from '../config/env.js';
import { HeartbeatModule } from '../heartbeat/heartbeat.module.js';
import { HeartbeatState } from '../heartbeat/heartbeat.state.js';
import { PrismaService } from '../infra/prisma.service.js';
import { REDIS } from '../infra/redis.js';
import { close, createHealthServer, listen } from './health.server.js';
import { probe } from './probe.js';

@Injectable()
export class HealthHttpServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HealthHttpServer.name);
  private readonly server: Server;
  /** Фактический порт (при `WORKER_HEALTH_PORT=0` — выбранный ОС). */
  port: number | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly heartbeat: HeartbeatState,
  ) {
    this.server = createHealthServer({
      liveness: () => ({
        status: 'ok',
        service: 'worker',
        uptimeSec: Math.round(process.uptime()),
        time: new Date().toISOString(),
        lastHeartbeatAt: this.heartbeat.lastBeatAt?.toISOString() ?? null,
      }),
      readiness: async () => {
        const [database, redis] = await Promise.all([
          probe(() => this.prisma.ping()),
          probe(() => this.redis.ping()),
        ]);
        return { database, redis };
      },
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    this.port = await listen(this.server, this.env.WORKER_HEALTH_PORT);
    this.logger.log(`health on :${String(this.port)}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await close(this.server);
  }
}

@Module({
  imports: [HeartbeatModule],
  providers: [PrismaService, HealthHttpServer],
  exports: [HealthHttpServer],
})
export class HealthModule {}
