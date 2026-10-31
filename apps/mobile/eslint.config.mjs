import { react } from '@baliqbozor/config/eslint';

export default [
  { ignores: ['android/**', 'ios/**', 'vendor/**'] },
  ...react({ tsconfigRootDir: import.meta.dirname }),
  {
    // CommonJS-конфиги, которых требуют Metro, Babel и Jest.
    files: ['*.config.js', 'jest.setup.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly', jest: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
