import type { StorageProvider } from './storage.provider.js';

/** Заглушка для тестов (SPEC 16). */
export class InMemoryStorageProvider implements StorageProvider {
  constructor(private readonly healthy = true) {}

  checkHealth(): Promise<void> {
    return this.healthy ? Promise.resolve() : Promise.reject(new Error('storage unavailable'));
  }
}
