module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // Пакеты RN и ESM-пакеты монорепозитория нужно прогнать через Babel.
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:(?:jest-)?react-native|@react-native(?:-community)?|@baliqbozor|openapi-fetch|react-native-safe-area-context)/)',
  ],
};
