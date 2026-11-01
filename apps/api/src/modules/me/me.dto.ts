import { MemberRole, OrgType, VerificationStatus } from '@baliqbozor/domain';
import { LOCALES, type Locale } from '@baliqbozor/i18n';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { AuthUserDto } from '../auth/auth.dto.js';

export class MyOrganizationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: Object.values(OrgType), enumName: 'OrgType' }) type!: OrgType;
  @ApiProperty({ enum: Object.values(MemberRole), enumName: 'MemberRole' }) role!: MemberRole;
  @ApiProperty({ enum: Object.values(VerificationStatus), enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;
}

export class MeDto extends AuthUserDto {
  @ApiProperty({ type: MyOrganizationDto, isArray: true }) organizations!: MyOrganizationDto[];
}

export class UpdateMeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ enum: LOCALES, enumName: 'Locale' })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale;
}
