import type { TransactionClient } from '@baliqbozor/db';
import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';

import { OutboxDispatcher } from './outbox.dispatcher.js';
import type { OutboxEvent } from './outbox.types.js';

Logger.overrideLogger(false);

const tx = {} as TransactionClient;
const event = (type: string): OutboxEvent => ({
  id: 'e1',
  type,
  aggregateType: 'Organization',
  aggregateId: 'o1',
  payload: {},
  attempts: 1,
});

describe('OutboxDispatcher', () => {
  it('runs every handler registered for the type, in order', async () => {
    const dispatcher = new OutboxDispatcher();
    const calls: string[] = [];
    dispatcher.on('org.created', () => Promise.resolve(void calls.push('a')));
    dispatcher.on('org.created', () => Promise.resolve(void calls.push('b')));
    dispatcher.on('org.updated', () => Promise.resolve(void calls.push('x')));
    await dispatcher.handle(event('org.created'), tx);
    expect(calls).toEqual(['a', 'b']);
  });

  it('treats known types without handlers and unknown types as done', async () => {
    const dispatcher = new OutboxDispatcher();
    const handler = jest.fn(() => Promise.resolve());
    dispatcher.on('org.created', handler);
    await expect(dispatcher.handle(event('org.member.added'), tx)).resolves.toBeUndefined();
    await expect(dispatcher.handle(event('nope.event'), tx)).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('propagates handler errors so the event is retried', async () => {
    const dispatcher = new OutboxDispatcher();
    dispatcher.on('org.created', () => Promise.reject(new Error('smtp down')));
    await expect(dispatcher.handle(event('org.created'), tx)).rejects.toThrow('smtp down');
  });
});
