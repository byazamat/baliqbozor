// Генерирует src/generated/messages.ts из locales/*.json: один источник ключей
// для Node, Next.js и Metro без поддержки import attributes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (locale) =>
  JSON.parse(readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));

const out = path.join(root, 'src', 'generated');
mkdirSync(out, { recursive: true });
writeFileSync(
  path.join(out, 'messages.ts'),
  [
    '// Сгенерировано scripts/generate-messages.js — не редактировать.',
    `export const uz = ${JSON.stringify(read('uz'), null, 2)} as const;`,
    `export const ru = ${JSON.stringify(read('ru'), null, 2)} as const;`,
    '',
  ].join('\n'),
);
