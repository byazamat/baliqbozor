import { Platform } from 'react-native';

/**
 * Адрес API. В debug: эмулятор Android ходит на хост через 10.0.2.2, iOS-симулятор — на localhost.
 * Адрес для релизных сборок задаётся при подготовке staging (M11), D-25.
 */
export const API_URL = __DEV__
  ? Platform.select({ android: 'http://10.0.2.2:4000', default: 'http://localhost:4000' })
  : 'https://api.invalid';
