import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { OutboxPoller } from './outbox.poller.js';
import type { OutboxEvent, OutboxSource } from './outbox.types.js';

Logger.overrideLogger(false);

function event(id: string): OutboxEvent {
  return {
    id,
    type: 'test.event',
    aggregateType: 'Test',
    aggregateId: id,
    payload: {},
    attempts: 0,
  };
}

function fakeSource(batches: OutboxEvent[][]) {
  const processed: string[] = [];
  const failed: [string, string][] = [];
  const claim = jest.fn<OutboxSource['claimBatch']>(() => Promise.resolve(batches.shift() ?? []));
  const source: OutboxSource = {
    claimBatch: claim,
    markProcessed: (id) => {
      processed.push(id);
      return Promise.resolve();
    },
    markFailed: (id, error) => {
      failed.push([id, error]);
      return Promise.resolve();
    },
  };
  return { source, claim, processed, failed };
}

describe('OutboxPoller.tick', () => {
  it('marks handled events processed and failures failed', async () => {
    const { source, processed, failed } = fakeSource([[event('a'), event('b'), event('c')]]);
    const handler = jest.fn((e: OutboxEvent) =>
      e.id === 'b' ? Promise.reject(new Error('boom')) : Promise.resolve(),
    );
    const poller = new OutboxPoller(source, handler, { intervalMs: 1000, batchSize: 10 });

    await expect(poller.tick()).resolves.toBe(3);

    expect(processed).toEqual(['a', 'c']);
    expect(failed).toEqual([['b', 'boom']]);
  });

  it('truncates long and non-Error failures', async () => {
    const { source, failed } = fakeSource([[event('x')]]);
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- проверяем не-Error причину
    const poller = new OutboxPoller(source, () => Promise.reject('z'.repeat(2000)), {
      intervalMs: 1000,
      batchSize: 10,
    });

    await poller.tick();

    expect(failed[0]?.[1]).toHaveLength(1000);
  });
});

describe('OutboxPoller loop', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('drains full batches immediately, then waits intervalMs', async () => {
    const { source, claim } = fakeSource([[event('1'), event('2')], [event('3')]]);
    const poller = new OutboxPoller(source, () => Promise.resolve(), {
      intervalMs: 5000,
      batchSize: 2,
    });

    poller.start();
    poller.start(); // повторный старт игнорируется
    await jest.advanceTimersByTimeAsync(1);
    expect(claim).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(4990);
    expect(claim).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(10);
    expect(claim).toHaveBeenCalledTimes(3);

    await poller.stop();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(claim).toHaveBeenCalledTimes(3);
  });

  it('keeps polling after a source error', async () => {
    const { source, claim } = fakeSource([]);
    claim.mockRejectedValueOnce(new Error('db down')).mockRejectedValueOnce('plain');
    const poller = new OutboxPoller(source, () => Promise.resolve(), {
      intervalMs: 100,
      batchSize: 10,
    });

    poller.start();
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);
    await jest.advanceTimersByTimeAsync(100);
    expect(claim).toHaveBeenCalledTimes(3);
    await poller.stop();
  });
});
