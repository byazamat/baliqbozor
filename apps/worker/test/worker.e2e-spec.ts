import type { INestApplicationContext } from '@nestjs/common';

import { createWorker } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { HealthHttpServer } from '../src/health/health.module.js';
import { HeartbeatState } from '../src/heartbeat/heartbeat.state.js';

async function waitFor(check: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('worker (e2e, real Postgres/Redis)', () => {
  let app: INestApplicationContext;
  let base: string;

  beforeAll(async () => {
    app = await createWorker(loadEnv({ ...process.env, WORKER_HEALTH_PORT: '0' }));
    await app.init();
    base = `http://127.0.0.1:${String(app.get(HealthHttpServer).port)}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('processes system.heartbeat jobs', async () => {
    const state = app.get(HeartbeatState);
    await waitFor(() => state.lastBeatAt !== null);
  });

  it('GET /health → 200 with last heartbeat', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ status: 'ok', service: 'worker' });
    expect(typeof body.lastHeartbeatAt).toBe('string');
  });

  it('GET /ready → 200 when database and redis are up', async () => {
    const res = await fetch(`${base}/ready`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'ok',
      checks: { database: { status: 'up' }, redis: { status: 'up' } },
    });
  });
});
