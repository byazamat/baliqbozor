import type { Prisma } from '@baliqbozor/db';

import { jsonReplacer } from './json-replacer.js';

/**
 * Значение для JSON-полей Prisma (аудит, payload событий): BigInt → строка, Decimal → строка
 * (его `toJSON`), Date → ISO, `undefined` убирается.
 */
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null, jsonReplacer)) as Prisma.InputJsonValue;
}
