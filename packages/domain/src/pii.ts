/**
 * Маскирование персональных данных для логов (SPEC 6.2, 13.2): `+998901234567` → `+99890*****67`.
 */
/** Номер с `+` или узбекским кодом 998 в начале; номера заказов (`FO-2026-000123`) не трогаем. */
const PHONE_IN_TEXT = /(?<![\w-])(?:\+\d|998)(?:[\s()-]*\d){7,13}/g;

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return '*'.repeat(digits.length);
  const visibleHead = digits.length >= 12 ? 5 : 2;
  const head = digits.slice(0, visibleHead);
  const tail = digits.slice(-2);
  return `${phone.trim().startsWith('+') ? '+' : ''}${head}${'*'.repeat(digits.length - visibleHead - 2)}${tail}`;
}

/** Маскирует все похожие на телефон последовательности в произвольной строке. */
export function maskPhonesInText(text: string): string {
  return text.replace(PHONE_IN_TEXT, (match) => maskPhone(match));
}

const MAX_MASK_DEPTH = 6;

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Маскирует телефоны во всех строках простых объектов и массивов (для логов).
 * Экземпляры классов (Error, Date, http.ServerResponse …) возвращаются как есть:
 * их обработают сериализаторы логгера, а разбор в простой объект ломает геттеры
 * вроде `res.headersSent` и обходит сокеты.
 */
export function maskPhonesDeep(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return maskPhonesInText(value);
  if (value === null || typeof value !== 'object' || depth >= MAX_MASK_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => maskPhonesDeep(v, depth + 1));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, maskPhonesDeep(v, depth + 1)]),
  );
}
