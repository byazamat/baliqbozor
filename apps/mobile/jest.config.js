module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup-after-env.js'],
  // Первый рендер RN на раннере CI занимает больше стандартных 5 с (был таймаут в CI).
  testTimeout: 30000,
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // Пакеты RN и ESM-пакеты монорепозитория нужно прогнать через Babel.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native|@react-native(?:-community)?|@baliqbozor|openapi-fetch|react-native-safe-area-context)/)',
  ],
};
