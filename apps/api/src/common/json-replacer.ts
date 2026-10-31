/**
 * Глобальная сериализация ответов: BigInt (деньги) → строка (SPEC 10.1).
 * Decimal (вес, координаты) сериализуется в строку собственным `toJSON` decimal.js.
 */
export function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
