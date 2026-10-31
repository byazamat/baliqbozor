import { RuleTester } from 'eslint';
import { test } from 'node:test';

import { noJsxLiterals } from './no-jsx-literals.js';

const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

test('no-jsx-literals', () => {
  tester.run('no-jsx-literals', noJsxLiterals, {
    valid: [
      '<p>{t("common.title")}</p>',
      '<p> · — 42 </p>',
      '<div className="flex gap-2" />',
      '<input placeholder={t("x")} />',
    ],
    invalid: [
      { code: '<p>Привет</p>', errors: [{ messageId: 'literal' }] },
      { code: '<p>{"Salom"}</p>', errors: [{ messageId: 'literal' }] },
      { code: '<p>{`Hello`}</p>', errors: [{ messageId: 'literal' }] },
      { code: '<img alt="Rasm" />', errors: [{ messageId: 'literal' }] },
      { code: '<input placeholder={"Введите"} />', errors: [{ messageId: 'literal' }] },
    ],
  });
});
