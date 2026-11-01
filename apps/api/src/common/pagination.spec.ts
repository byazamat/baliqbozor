import { DomainError } from '@baliqbozor/domain';

import { afterCursor, decodeCursor, encodeCursor, PageDto, toPage } from './pagination.js';

const at = (s: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, s));

describe('cursor pagination', () => {
  it('round-trips a cursor', () => {
    const key = { createdAt: at(5), id: '0f8c' };
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it.each([
    '',
    'not-base64!',
    Buffer.from('{"a":1}').toString('base64url'),
    Buffer.from('["x","y"]').toString('base64url'),
    Buffer.from('[1,2]').toString('base64url'),
  ])('rejects malformed cursor %j', (cursor) => {
    expect(() => decodeCursor(cursor)).toThrow(DomainError);
  });

  it('builds the "after" condition for createdAt DESC, id DESC', () => {
    expect(afterCursor(undefined)).toEqual({});
    expect(afterCursor(encodeCursor({ createdAt: at(5), id: 'b' }))).toEqual({
      OR: [{ createdAt: { lt: at(5) } }, { createdAt: at(5), id: { lt: 'b' } }],
    });
  });

  it('returns nextCursor only when there are more rows', () => {
    const rows = [3, 2, 1].map((s) => ({ createdAt: at(s), id: `id${String(s)}` }));
    const page = toPage(rows, 2);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({ createdAt: at(2), id: 'id2' });
    expect(toPage(rows, 3).nextCursor).toBeNull();
    expect(toPage([], 3)).toEqual({ items: [], nextCursor: null });
  });

  it('creates and caches named page DTOs', () => {
    class ThingDto {}
    expect(PageDto(ThingDto).name).toBe('ThingDtoPage');
    expect(PageDto(ThingDto)).toBe(PageDto(ThingDto));
  });
});
