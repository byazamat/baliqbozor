import { OrgType, VerificationStatus } from '@baliqbozor/domain';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { CursorPageQueryDto } from '../../common/pagination.js';
import { MediaDto } from '../media/media.dto.js';
import { MemberDto, OrgDto } from '../orgs/orgs.dto.js';

export class SubmitVerificationDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  mediaIds!: string[];

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class DecisionDto {
  @ApiPropertyOptional({ maxLength: 1000, description: 'Обязателен для отказа и блокировки' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RequiredNoteDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;
}

export class AdminOrgsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: Object.values(VerificationStatus), enumName: 'VerificationStatus' })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;

  @ApiPropertyOptional({ enum: Object.values(OrgType), enumName: 'OrgType' })
  @IsOptional()
  @IsEnum(OrgType)
  type?: OrgType;

  @ApiPropertyOptional({ description: 'Название, СТИР или телефон участника' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AdminOrgRowDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: Object.values(OrgType), enumName: 'OrgType' }) type!: OrgType;
  @ApiProperty({ enum: Object.values(VerificationStatus), enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;
  @ApiProperty({ type: String, nullable: true }) tin!: string | null;
  @ApiProperty({ type: String, nullable: true }) regionNameRu!: string | null;
  @ApiProperty({ type: String, nullable: true }) regionNameUz!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AdminOrgRowPageDto {
  @ApiProperty({ type: AdminOrgRowDto, isArray: true }) items!: AdminOrgRowDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class OpsTaskDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'VERIFY_ORG' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: ['OPEN', 'DONE', 'CANCELLED'] }) status!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) orgId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) assigneeId!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dueAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AdminOrgDetailsDto {
  @ApiProperty({ type: OrgDto }) org!: OrgDto;
  @ApiProperty({ type: MemberDto, isArray: true }) members!: MemberDto[];
  @ApiProperty({ type: MediaDto, isArray: true, description: 'Документы верификации' })
  documents!: MediaDto[];
  @ApiProperty({ type: OpsTaskDto, isArray: true, description: 'Открытые задачи по организации' })
  tasks!: OpsTaskDto[];
}

export class TasksQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'DONE', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['OPEN', 'DONE', 'CANCELLED'])
  status?: 'OPEN' | 'DONE' | 'CANCELLED';

  @ApiPropertyOptional({ example: 'VERIFY_ORG' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;
}

export class OpsTaskPageDto {
  @ApiProperty({ type: OpsTaskDto, isArray: true }) items!: OpsTaskDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'DONE', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['OPEN', 'DONE', 'CANCELLED'])
  status?: 'OPEN' | 'DONE' | 'CANCELLED';

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Назначить; null — снять',
  })
  @IsOptional()
  @ValidateIf((o: { assigneeId?: unknown }) => o.assigneeId !== null)
  @IsUUID()
  assigneeId?: string | null;
}
