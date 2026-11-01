import type { TransactionClient } from '@baliqbozor/db';
import { DomainError, ErrorCode, type MediaPurpose } from '@baliqbozor/domain';

/** Сколько файлов можно привязать к хозяйству или наличию. */
export const MAX_ATTACHED_MEDIA = 10;

/**
 * Привязать файлы к хозяйству или наличию в заданном порядке (D-52): только свои загрузки нужного
 * назначения, не привязанные к другой сущности. Файлы, которых нет в списке, отвязываются.
 */
export async function attachMedia(
  tx: TransactionClient,
  params: {
    orgId: string;
    purpose: Extract<MediaPurpose, 'FARM_PHOTO' | 'LISTING_MEDIA'>;
    mediaIds: string[];
    target: { farmId: string } | { listingId: string };
  },
): Promise<void> {
  const ids = [...new Set(params.mediaIds)];
  const field = 'farmId' in params.target ? 'farmId' : 'listingId';
  const targetId = 'farmId' in params.target ? params.target.farmId : params.target.listingId;
  const usable = await tx.mediaFile.findMany({
    where: {
      id: { in: ids },
      orgId: params.orgId,
      purpose: params.purpose,
      status: { in: ['UPLOADED', 'PROCESSED'] },
      OR: [{ [field]: null }, { [field]: targetId }],
      ...(field === 'farmId' ? { listingId: null } : { farmId: null }),
    },
    select: { id: true },
  });
  if (usable.length !== ids.length || ids.length > MAX_ATTACHED_MEDIA) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Unknown or unavailable media', {
      fields: [{ field: 'mediaIds', constraints: ['ownUploadedMedia'] }],
    });
  }
  await tx.mediaFile.updateMany({
    where: { [field]: targetId, id: { notIn: ids } },
    data: { [field]: null },
  });
  for (const [sortOrder, id] of ids.entries()) {
    await tx.mediaFile.update({ where: { id }, data: { [field]: targetId, sortOrder } });
  }
}
