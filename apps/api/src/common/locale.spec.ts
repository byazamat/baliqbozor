import { localeFromHeader } from './locale.js';

describe('localeFromHeader', () => {
  it.each([
    [undefined, 'uz'],
    ['', 'uz'],
    ['ru', 'ru'],
    ['ru-RU,ru;q=0.9', 'ru'],
    ['en-US, ru;q=0.5', 'ru'],
    ['uz-Latn-UZ', 'uz'],
    ['de', 'uz'],
  ])('%s → %s', (header, expected) => {
    expect(localeFromHeader(header)).toBe(expected);
  });
});
