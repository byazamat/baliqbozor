import { MediaKind, MediaPurpose } from '@baliqbozor/domain';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UploadUrlRequestDto {
  @ApiProperty({ enum: Object.values(MediaKind), enumName: 'MediaKind' })
  @IsEnum(MediaKind)
  kind!: MediaKind;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @ApiProperty({ example: 1_048_576 })
  @IsInt()
  @Min(1)
  @Max(1_073_741_824)
  sizeBytes!: number;

  @ApiProperty({
    enum: Object.values(MediaPurpose),
    enumName: 'MediaPurpose',
    description:
      'Требует X-Org-Id. ORG_VERIFICATION — OWNER; FARM_PHOTO и LISTING_MEDIA — OWNER/MANAGER продавца',
  })
  @IsEnum(MediaPurpose)
  purpose!: MediaPurpose;
}

export class UploadUrlDto {
  @ApiProperty({ format: 'uuid' }) mediaId!: string;
  @ApiProperty({ description: 'Presigned PUT, 10 минут' }) uploadUrl!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Заголовки для PUT',
  })
  headers!: Record<string, string>;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}

export class MediaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: Object.values(MediaKind), enumName: 'MediaKind' }) kind!: MediaKind;
  @ApiProperty({
    enum: ['PENDING_UPLOAD', 'UPLOADED', 'PROCESSED', 'REJECTED'],
    description: 'UPLOADED — ждёт обработки в worker; PROCESSED — проверен и очищен (D-52)',
  })
  status!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ type: Number, nullable: true }) width!: number | null;
  @ApiProperty({ type: Number, nullable: true }) height!: number | null;
  @ApiProperty({ type: Number, nullable: true }) durationSec!: number | null;
  @ApiProperty({ description: 'Есть превью (`GET /media/:id/url?variant=thumb`)' })
  hasThumbnail!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['UNKNOWN_TYPE', 'TYPE_MISMATCH', 'VIDEO_TOO_LONG', 'UNREADABLE', 'SIZE_MISMATCH'],
  })
  rejectReason!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export function toMediaDto(m: {
  id: string;
  kind: MediaKind;
  status: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  thumbnailKey: string | null;
  rejectReason: string | null;
  createdAt: Date;
}): MediaDto {
  return {
    id: m.id,
    kind: m.kind,
    status: m.status,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    width: m.width,
    height: m.height,
    durationSec: m.durationSec,
    hasThumbnail: m.thumbnailKey !== null,
    rejectReason: m.rejectReason,
    createdAt: m.createdAt,
  };
}

export class DownloadUrlQueryDto {
  @ApiProperty({ required: false, enum: ['original', 'thumb'], default: 'original' })
  @IsOptional()
  @IsIn(['original', 'thumb'])
  variant?: 'original' | 'thumb';
}

export class DownloadUrlDto {
  @ApiProperty({ description: 'Подписанная ссылка на скачивание, 10 минут' }) url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
