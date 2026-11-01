import { truncateAll } from '@baliqbozor/db/testing';
import { OUTBOX_MAX_ATTEMPTS } from '@baliqbozor/domain';

import { loadEnv } from '../src/config/env.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { OutboxDispatcher } from '../src/outbox/outbox.dispatcher.js';
import { OutboxPoller } from '../src/outbox/outbox.poller.js';
import { OUTBOX_LEASE_MS, PrismaOutboxSource } from '../src/outbox/prisma-outbox.source.js';

describe('outbox (e2e, real Postgres)', () => {
  let prisma: PrismaService;
  let source: PrismaOutboxSource;
  let close: () => Promise<void>;
  let now = new Date('2026-11-01T10:00:00Z');

  beforeAll(() => {
    prisma = new PrismaService(loadEnv());
    source = new PrismaOutboxSource(prisma);
    source.clock = () => now;
    close = () => prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    now = new Date('2026-11-01T10:00:00Z');
    await truncateAll(prisma.client);
  });

  afterAll(async () => {
    await close();
  });

  const addEvent = (id: string, createdAt: Date) =>
    prisma.client.domainEvent.create({
      data: {
        id,
        type: 'org.created',
        aggregateType: 'Organization',
        aggregateId: 'o1',
        payload: { orgId: 'o1' },
        createdAt,
        availableAt: createdAt,
      },
    });

  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-00000000000${String(i + 1)}`);

  it('claims events in creation order, leases them and counts the attempt', async () => {
    const [a, b, c] = ids(3);
    await addEvent(b ?? '', new Date('2026-11-01T09:00:02Z'));
    await addEvent(a ?? '', new Date('2026-11-01T09:00:01Z'));
    await addEvent(c ?? '', new Date('2026-11-01T09:00:03Z'));

    const claimed = await source.claimBatch(2);
    expect(claimed.map((e) => e.id)).toEqual([a, b]);
    expect(claimed[0]).toMatchObject({
      type: 'org.created',
      attempts: 1,
      payload: { orgId: 'o1' },
    });

    // арендованные не выдаются повторно, пока аренда не истекла
    expect((await source.claimBatch(10)).map((e) => e.id)).toEqual([c]);
    expect(await source.claimBatch(10)).toEqual([]);
    now = new Date(now.getTime() + OUTBOX_LEASE_MS + 1);
    expect(await source.claimBatch(10)).toHaveLength(3);
  });

  it('does not hand the same event to two concurrent claimers', async () => {
    const all = ids(8);
    for (const [i, id] of all.entries())
      await addEvent(id, new Date(Date.UTC(2026, 10, 1, 9, 0, i)));
    const [first, second] = await Promise.all([source.claimBatch(5), source.claimBatch(5)]);
    const claimed = [...first, ...second].map((e) => e.id).sort();
    expect(claimed).toEqual([...all].sort());
  });

  it('marks processed atomically with the handler writes', async () => {
    const [id] = ids(1);
    await addEvent(id ?? '', now);
    const [event] = await source.claimBatch(1);
    if (!event) throw new Error('no event');

    await expect(
      source.complete(event, async (_e, tx) => {
        await tx.setting.create({ data: { key: 'probe', value: 1 } });
        throw new Error('handler failed');
      }),
    ).rejects.toThrow('handler failed');
    expect(await prisma.client.setting.count()).toBe(0);
    expect(
      (await prisma.client.domainEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt,
    ).toBeNull();

    await source.complete(event, async (_e, tx) => {
      await tx.setting.create({ data: { key: 'probe', value: 1 } });
    });
    expect(await prisma.client.setting.count()).toBe(1);
    expect(
      (await prisma.client.domainEvent.findUniqueOrThrow({ where: { id: event.id } })).processedAt,
    ).toEqual(now);
  });

  it('backs off after a failure and stops after the max attempts', async () => {
    const [id] = ids(1);
    await addEvent(id ?? '', now);
    const [event] = await source.claimBatch(1);
    if (!event) throw new Error('no event');
    await source.fail(event, 'boom');
    const row = await prisma.client.domainEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.lastError).toBe('boom');
    expect(row.availableAt.getTime()).toBe(now.getTime() + 5_000);
    expect(await source.claimBatch(1)).toEqual([]);

    await prisma.client.domainEvent.update({
      where: { id: event.id },
      data: { attempts: OUTBOX_MAX_ATTEMPTS, availableAt: now },
    });
    expect(await source.claimBatch(1)).toEqual([]);
  });

  it('poller drains events through the dispatcher', async () => {
    const all = ids(3);
    for (const [i, id] of all.entries())
      await addEvent(id, new Date(Date.UTC(2026, 10, 1, 9, 0, i)));
    const dispatcher = new OutboxDispatcher();
    const seen: string[] = [];
    dispatcher.on('org.created', (e) => Promise.resolve(void seen.push(e.id)));
    const poller = new OutboxPoller(source, dispatcher.handle, { intervalMs: 1000, batchSize: 2 });
    expect(await poller.tick()).toBe(2);
    expect(await poller.tick()).toBe(1);
    expect(seen).toEqual(all);
    expect(await prisma.client.domainEvent.count({ where: { processedAt: null } })).toBe(0);
  });
});
