import { Decimal } from '@baliqbozor/domain';

import { jsonReplacer } from './json-replacer.js';

describe('jsonReplacer', () => {
  it('serializes BigInt and Decimal as strings', () => {
    const json = JSON.stringify(
      { price: 28000n, volume: new Decimal('1500.5'), nested: [{ total: 37960000n }], n: 1 },
      jsonReplacer,
    );
    expect(JSON.parse(json)).toEqual({
      price: '28000',
      volume: '1500.5',
      nested: [{ total: '37960000' }],
      n: 1,
    });
  });
});
