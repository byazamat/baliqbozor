/**
 * Телефоны Узбекистана (D-32): хранение `+998XXXXXXXXX`.
 * Принимает `+998 90 123-45-67`, `998901234567`, `(90) 123 45 67`, `901234567`.
 */
const STORED = /^\+998\d{9}$/;

export function normalizeUzPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[+\d\s()-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && !digits.startsWith('998')) return null;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  if (digits.length === 9 && !trimmed.startsWith('+')) return `+998${digits}`;
  return null;
}

export function isStoredUzPhone(value: string): boolean {
  return STORED.test(value);
}
