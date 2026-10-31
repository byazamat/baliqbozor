import type { Server } from 'node:http';

import { close, createHealthServer, listen } from './health.server.js';
import type { CheckResult } from './probe.js';

const up: CheckResult = { status: 'up', latencyMs: 1 };
const down: CheckResult = { status: 'down', latencyMs: 1, error: 'refused' };

async function start(readiness: () => Promise<Record<string, CheckResult>>) {
  const server = createHealthServer({ liveness: () => ({ status: 'ok' }), readiness });
  const port = await listen(server, 0);
  return { server, base: `http://127.0.0.1:${String(port)}` };
}

describe('health server', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) await close(server);
    server = undefined;
  });

  it('GET /health → 200', async () => {
    const s = await start(() => Promise.resolve({ redis: up }));
    server = s.server;
    const res = await fetch(`${s.base}/health?x=1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready → 200 when all up, 503 when any down or check throws', async () => {
    let mode: 'up' | 'down' | 'throw' = 'up';
    const s = await start(() =>
      mode === 'throw'
        ? Promise.reject(new Error('x'))
        : Promise.resolve({ redis: up, database: mode === 'up' ? up : down }),
    );
    server = s.server;

    expect((await fetch(`${s.base}/ready`)).status).toBe(200);
    mode = 'down';
    const res = await fetch(`${s.base}/ready`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'error', checks: { database: down } });
    mode = 'throw';
    expect((await fetch(`${s.base}/ready`)).status).toBe(503);
  });

  it('unknown path or method → 404', async () => {
    const s = await start(() => Promise.resolve({}));
    server = s.server;
    expect((await fetch(`${s.base}/nope`)).status).toBe(404);
    expect((await fetch(`${s.base}/health`, { method: 'POST' })).status).toBe(404);
  });

  it('close on a stopped server is a no-op; listen rejects on busy port', async () => {
    const s = await start(() => Promise.resolve({}));
    server = s.server;
    const port = Number(new URL(s.base).port);
    const other = createHealthServer({
      liveness: () => ({}),
      readiness: () => Promise.resolve({}),
    });
    await expect(listen(other, port)).rejects.toThrow(/EADDRINUSE/);
    await expect(close(other)).resolves.toBeUndefined();
  });
});
