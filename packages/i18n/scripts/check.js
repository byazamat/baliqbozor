// Паритет ключей uz/ru (SPEC 12.5) и наличие errors.<CODE> для каждого кода ошибки.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ERROR_CODES } from '@baliqbozor/domain';

const root = path.resolve(import.meta.dirname, '..');
const LOCALES = ['uz', 'ru'];

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') return flatten(value, full);
    if (typeof value !== 'string' || value.trim() === '') return [`!empty:${full}`];
    return [full];
  });
}

const keys = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    new Set(flatten(JSON.parse(readFileSync(path.join(root, 'locales', `${l}.json`), 'utf8')))),
  ]),
);

const problems = [];
for (const locale of LOCALES) {
  for (const key of keys[locale]) {
    if (key.startsWith('!empty:')) problems.push(`${locale}: empty value ${key.slice(7)}`);
  }
  for (const other of LOCALES.filter((l) => l !== locale)) {
    for (const key of keys[other]) {
      if (!key.startsWith('!') && !keys[locale].has(key))
        problems.push(`${locale}: missing ${key}`);
    }
  }
  for (const code of ERROR_CODES) {
    if (!keys[locale].has(`errors.${code}`)) problems.push(`${locale}: missing errors.${code}`);
  }
}

if (problems.length > 0) {
  process.stderr.write(`i18n:check failed:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`i18n:check ok (${keys.uz.size} keys in ${LOCALES.join(', ')})\n`);
