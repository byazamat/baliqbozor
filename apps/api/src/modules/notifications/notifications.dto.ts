import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { CursorPageQueryDto } from '../../common/pagination.js';

export class NotificationsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ description: 'Только непрочитанные' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;
}

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'org.verification.approved' }) eventType!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Идентификаторы для перехода',
  })
  data!: Record<string, unknown> | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class NotificationPageDto {
  @ApiProperty({ type: NotificationDto, isArray: true }) items!: NotificationDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty({ description: 'Непрочитанных всего' }) unreadCount!: number;
}

export class ReadAllResultDto {
  @ApiProperty() updated!: number;
}
