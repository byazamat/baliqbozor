import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { CheckResult } from './probe.js';

export interface HealthServerDeps {
  liveness: () => Record<string, unknown>;
  readiness: () => Promise<Record<string, CheckResult>>;
}

function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Минимальный HTTP-сервер для проб оркестратора (D-05): только `GET /health` и `GET /ready`. */
export function createHealthServer(deps: HealthServerDeps): Server {
  return createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method !== 'GET' || (path !== '/health' && path !== '/ready')) {
      send(res, 404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
      return;
    }
    if (path === '/health') {
      send(res, 200, deps.liveness());
      return;
    }
    deps
      .readiness()
      .then((checks) => {
        const ok = Object.values(checks).every((c) => c.status === 'up');
        send(res, ok ? 200 : 503, { status: ok ? 'ok' : 'error', checks });
      })
      .catch(() => send(res, 503, { status: 'error', checks: {} }));
  });
}

export async function listen(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return (server.address() as AddressInfo).port;
}

export async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}
