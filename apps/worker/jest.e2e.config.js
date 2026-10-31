import { base } from './jest.config.js';

export default {
  ...base,
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 20000,
};
