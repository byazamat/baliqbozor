import type { IncomingMessage, ServerResponse } from 'node:http';

import { genRequestId } from './request-id.js';

function call(header?: string): { id: string; echoed: unknown } {
  let echoed: unknown;
  const req = {
    headers: header === undefined ? {} : { 'x-request-id': header },
  } as IncomingMessage;
  const res = { setHeader: (_: string, v: unknown) => (echoed = v) } as unknown as ServerResponse;
  return { id: genRequestId(req, res), echoed };
}

describe('genRequestId', () => {
  it('keeps a valid incoming id', () => {
    expect(call('client-req-12345')).toEqual({
      id: 'client-req-12345',
      echoed: 'client-req-12345',
    });
  });

  it('replaces missing or unsafe ids with a UUID', () => {
    for (const header of [undefined, 'short', 'bad id with spaces', 'x'.repeat(65)]) {
      const { id, echoed } = call(header);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(echoed).toBe(id);
    }
  });
});
