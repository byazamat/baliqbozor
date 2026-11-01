import type { PresignedUpload, StorageProvider, StoredObject } from './storage.provider.js';

/** Заглушка для тестов (SPEC 16): объекты в памяти, ссылки вида `memory://`. */
export class InMemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, StoredObject>();

  constructor(private readonly healthy = true) {}

  checkHealth(): Promise<void> {
    return this.healthy ? Promise.resolve() : Promise.reject(new Error('storage unavailable'));
  }

  presignPut(
    key: string,
    contentType: string,
    _sizeBytes: number,
    expiresInSec: number,
  ): Promise<PresignedUpload> {
    return Promise.resolve({
      url: `memory://put/${key}`,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
    });
  }

  presignGet(key: string): Promise<string> {
    return Promise.resolve(`memory://get/${key}`);
  }

  head(key: string): Promise<StoredObject | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }
}
