/**
 * Абстракция файлового хранилища (SPEC 16): приватный бакет, доступ только по подписанным ссылкам
 * (SPEC 13.2). Presigned URL и проверка загрузки — M1 (D-12), обработка файлов — M2.
 */
export interface PresignedUpload {
  url: string;
  /** Заголовки, которые клиент обязан отправить с PUT (подписаны). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | undefined;
}

export interface StorageProvider {
  /** Проверка доступности приватного бакета для `/ready`. */
  checkHealth(signal?: AbortSignal): Promise<void>;
  /** Ссылка для загрузки ровно `sizeBytes` байт с типом `contentType`. */
  presignPut(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresInSec: number,
  ): Promise<PresignedUpload>;
  /** Ссылка на скачивание. */
  presignGet(key: string, expiresInSec: number): Promise<string>;
  /** Метаданные объекта или `null`, если его нет. */
  head(key: string): Promise<StoredObject | null>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
