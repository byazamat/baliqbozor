import { randomUUID } from 'node:crypto';

import {
  assertMediaUploadAllowed,
  DomainError,
  ErrorCode,
  uploadedObjectIssue,
} from '@baliqbozor/domain';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthContext } from '../../common/request-context.js';
import { PrismaService } from '../../infra/prisma.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../providers/storage/storage.provider.js';
import { assertCanInOrg, requireOrg } from '../auth/policy.js';
import type { DownloadUrlDto, MediaDto, UploadUrlDto, UploadUrlRequestDto } from './media.dto.js';

/** Срок подписанных ссылок — 10 минут (SPEC 10.3). */
export const URL_TTL_SEC = 600;

const isStaff = (auth: AuthContext) =>
  auth.platformRole === 'OPERATOR' || auth.platformRole === 'ADMIN';

/** Загрузка файлов через presigned URL (SPEC 10.3, 13.2; D-12, D-44). Обработка — M2. */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async requestUpload(auth: AuthContext, dto: UploadUrlRequestDto): Promise<UploadUrlDto> {
    assertMediaUploadAllowed(dto);
    // ORG_VERIFICATION: документы загружает тот, кто их отправляет, — OWNER (SPEC 10.3).
    assertCanInOrg(auth, 'ORG_SUBMIT_VERIFICATION');
    const orgId = requireOrg(auth).id;
    const id = randomUUID();
    const storageKey = `${dto.purpose.toLowerCase()}/${orgId}/${id}`;
    const mimeType = dto.mimeType.toLowerCase();
    await this.prisma.client.mediaFile.create({
      data: {
        id,
        uploaderId: auth.userId,
        kind: dto.kind,
        mimeType,
        sizeBytes: dto.sizeBytes,
        storageKey,
        orgId,
      },
    });
    const upload = await this.storage.presignPut(storageKey, mimeType, dto.sizeBytes, URL_TTL_SEC);
    return {
      mediaId: id,
      uploadUrl: upload.url,
      headers: upload.headers,
      expiresAt: upload.expiresAt,
    };
  }

  /** Подтверждение: объект в хранилище есть и его размер совпадает с заявленным. */
  async complete(auth: AuthContext, mediaId: string): Promise<MediaDto> {
    const media = await this.prisma.client.mediaFile.findUnique({ where: { id: mediaId } });
    if (!media || media.uploaderId !== auth.userId)
      throw new DomainError(ErrorCode.NOT_FOUND, 'Media not found');
    if (media.status !== 'PENDING_UPLOAD') return toDto(media);

    const object = await this.storage.head(media.storageKey);
    const issue = uploadedObjectIssue(media.sizeBytes, object);
    if (issue === 'NOT_UPLOADED') {
      throw new DomainError(ErrorCode.CONFLICT, 'File is not uploaded yet', { reason: issue });
    }
    if (issue === 'SIZE_MISMATCH') {
      await this.prisma.client.mediaFile.update({
        where: { id: media.id },
        data: { status: 'REJECTED' },
      });
      throw new DomainError(ErrorCode.CONFLICT, 'Uploaded file size differs from declared', {
        reason: issue,
      });
    }
    const updated = await this.prisma.client.mediaFile.update({
      where: { id: media.id },
      data: { status: 'UPLOADED' },
    });
    return toDto(updated);
  }

  /** Ссылка на скачивание: загрузивший, члены организации файла, оператор и администратор. */
  async downloadUrl(auth: AuthContext, mediaId: string): Promise<DownloadUrlDto> {
    const media = await this.prisma.client.mediaFile.findUnique({ where: { id: mediaId } });
    const ready = media && (media.status === 'UPLOADED' || media.status === 'PROCESSED');
    if (!media || !ready || !(await this.canRead(auth, media))) {
      throw new DomainError(ErrorCode.NOT_FOUND, 'Media not found');
    }
    const url = await this.storage.presignGet(media.storageKey, URL_TTL_SEC);
    return { url, expiresAt: new Date(Date.now() + URL_TTL_SEC * 1000) };
  }

  private async canRead(
    auth: AuthContext,
    media: { uploaderId: string; orgId: string | null },
  ): Promise<boolean> {
    if (media.uploaderId === auth.userId || isStaff(auth)) return true;
    if (!media.orgId) return false;
    const member = await this.prisma.client.membership.findUnique({
      where: { userId_orgId: { userId: auth.userId, orgId: media.orgId } },
      select: { id: true },
    });
    return !!member;
  }
}

function toDto(m: {
  id: string;
  kind: MediaDto['kind'];
  status: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): MediaDto {
  return {
    id: m.id,
    kind: m.kind,
    status: m.status,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    createdAt: m.createdAt,
  };
}
