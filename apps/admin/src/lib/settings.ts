/** Значение настройки для поля ввода: объекты — JSON, остальное — как есть. */
export function settingToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Разбор ввода по типу значения по умолчанию. `undefined` — некорректный JSON. */
export function settingFromText(text: string, sample: unknown): unknown {
  if (typeof sample === 'number') return text.trim() === '' ? Number.NaN : Number(text);
  if (typeof sample === 'boolean') return text === 'true';
  if (typeof sample === 'string') return text.trim();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
