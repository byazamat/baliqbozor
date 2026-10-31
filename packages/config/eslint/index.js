import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { noJsxLiterals } from './no-jsx-literals.js';

const IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/generated/**',
  '**/next-env.d.ts',
];

export const localPlugin = {
  meta: { name: 'baliqbozor' },
  rules: { 'no-jsx-literals': noJsxLiterals },
};

/**
 * Базовая конфигурация для TypeScript-пакетов.
 * @param {{ tsconfigRootDir: string }} options
 */
export function base({ tsconfigRootDir }) {
  return tseslint.config(
    { ignores: IGNORES },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
        globals: { ...globals.node },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-ignore': 'allow-with-description',
            'ts-expect-error': 'allow-with-description',
            'ts-nocheck': true,
            minimumDescriptionLength: 10,
          },
        ],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-console': 'error',
      },
    },
    {
      // Тела ответов supertest/fetch типизированы как any библиотекой; явный any по-прежнему запрещён.
      files: [
        '**/*.{spec,test,e2e-spec}.{ts,tsx}',
        '**/test/**/*.{ts,tsx}',
        '**/e2e/**/*.{ts,tsx}',
      ],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
      },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  );
}

/** Правила для React-кода (web, admin, ui, mobile). */
export function react({ tsconfigRootDir }) {
  return tseslint.config(...base({ tsconfigRootDir }), {
    files: ['**/*.{tsx,jsx}'],
    plugins: { 'react-hooks': reactHooks, baliqbozor: localPlugin },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'baliqbozor/no-jsx-literals': 'error',
    },
  });
}

/** Next.js-приложения. */
export function next({ tsconfigRootDir }) {
  return tseslint.config(...react({ tsconfigRootDir }), {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  });
}

/** NestJS: декораторы требуют runtime-импортов типов для emitDecoratorMetadata. */
export function nest({ tsconfigRootDir }) {
  return tseslint.config(...base({ tsconfigRootDir }), {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  });
}
