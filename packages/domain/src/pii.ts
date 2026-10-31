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
