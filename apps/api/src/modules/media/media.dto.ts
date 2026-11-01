import { MediaKind, MediaPurpose } from '@baliqbozor/domain';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

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
    description: 'ORG_VERIFICATION требует X-Org-Id',
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
  @ApiProperty({ enum: ['PENDING_UPLOAD', 'UPLOADED', 'PROCESSED', 'REJECTED'] }) status!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class DownloadUrlDto {
  @ApiProperty({ description: 'Подписанная ссылка на скачивание, 10 минут' }) url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
