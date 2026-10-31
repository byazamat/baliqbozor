/**
 * Абстракция файлового хранилища (SPEC 16). Presigned URL и загрузка — в M1 (DECISIONS D-12).
 */
export interface StorageProvider {
  /** Проверка доступности приватного бакета для `/ready`. */
  checkHealth(signal?: AbortSignal): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
