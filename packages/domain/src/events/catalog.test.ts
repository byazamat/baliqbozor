import { describe, expect, it } from 'vitest';

import {
  AGGREGATE_OF,
  DOMAIN_EVENT_TYPES,
  isDomainEventType,
  OUTBOX_MAX_ATTEMPTS,
  outboxRetryDelayMs,
} from './catalog.js';

describe('domain event catalog', () => {
  it('maps every event type to an aggregate', () => {
    expect(DOMAIN_EVENT_TYPES).toContain('org.verification.approved');
    for (const type of DOMAIN_EVENT_TYPES) expect(AGGREGATE_OF[type]).toMatch(/^[A-Z]\w+$/);
  });

  it('recognizes known types only', () => {
    expect(isDomainEventType('ops.task.created')).toBe(true);
    expect(isDomainEventType('order.unknown')).toBe(false);
    expect(isDomainEventType('constructor')).toBe(false);
  });
});

describe('outboxRetryDelayMs', () => {
  it('doubles from 5 seconds and caps at 10 minutes', () => {
    expect(outboxRetryDelayMs(0)).toBe(5_000);
    expect(outboxRetryDelayMs(1)).toBe(5_000);
    expect(outboxRetryDelayMs(2)).toBe(10_000);
    expect(outboxRetryDelayMs(4)).toBe(40_000);
    expect(outboxRetryDelayMs(OUTBOX_MAX_ATTEMPTS)).toBe(600_000);
  });
});
