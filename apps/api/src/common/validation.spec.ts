import type { ValidationError } from '@nestjs/common';

import { flattenValidationErrors } from './validation.js';

describe('flattenValidationErrors', () => {
  it('flattens nested errors into dotted fields', () => {
    const errors = [
      { property: 'phone', constraints: { isPhoneNumber: 'bad' }, children: [] },
      {
        property: 'address',
        children: [{ property: 'lat', constraints: { isLatitude: 'x', isNotEmpty: 'y' } }],
      },
    ] as ValidationError[];
    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'phone', constraints: ['isPhoneNumber'] },
      { field: 'address.lat', constraints: ['isLatitude', 'isNotEmpty'] },
    ]);
  });
});
