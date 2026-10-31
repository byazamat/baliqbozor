const path = require('node:path');

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro в pnpm-монорепозитории (D-07): следим за корнем репозитория, чтобы видеть
 * workspace-пакеты, и ищем зависимости сначала в node_modules приложения, затем в корне.
 * Симлинки pnpm Metro поддерживает штатно.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
