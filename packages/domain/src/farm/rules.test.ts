import { describe, expect, it } from 'vitest';

import { type DomainError } from '../errors.js';
import { assertValidFarm, type FarmInput } from './rules.js';

const fieldsOf = (input: FarmInput, partial = false) => {
  try {
    assertValidFarm(input, partial);
    return [];
  } catch (err) {
    const d = (err as DomainError).details as {
      fields: { field: string; constraints: string[] }[];
    };
    return d.fields.map((f) => `${f.field}:${f.constraints.join(',')}`);
  }
};

const valid: FarmInput = { name: 'Baliq ko‘li', lat: 39.65, lng: 66.96, waterBodyTypes: ['POND'] };

describe('assertValidFarm', () => {
  it('accepts a complete farm', () => {
    expect(fieldsOf(valid)).toEqual([]);
    expect(fieldsOf({ ...valid, areaHa: 12.5 })).toEqual([]);
  });

  it('reports every broken field', () => {
    expect(fieldsOf({ name: ' a', waterBodyTypes: [], areaHa: 0 })).toEqual([
      'name:minLength',
      'lat:pairRequired',
      'waterBodyTypes:arrayNotEmpty',
      'areaHa:positive',
    ]);
    expect(fieldsOf({ ...valid, lat: 69.24, lng: 41.29 })).toEqual(['lat:serviceArea']);
  });

  it('checks only provided fields on update', () => {
    expect(fieldsOf({ areaHa: null }, true)).toEqual([]);
    expect(fieldsOf({ lat: 40 }, true)).toEqual(['lat:pairRequired']);
    expect(fieldsOf({ waterBodyTypes: [] }, true)).toEqual(['waterBodyTypes:arrayNotEmpty']);
  });
});
