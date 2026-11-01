import { LegalForm, MemberRole, OrgType, VerificationStatus } from '@baliqbozor/domain';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateOrgDto {
  @ApiProperty({ enum: Object.values(OrgType), enumName: 'OrgType' })
  @IsEnum(OrgType)
  type!: OrgType;

  @ApiProperty({ enum: Object.values(LegalForm), enumName: 'LegalForm' })
  @IsEnum(LegalForm)
  legalForm!: LegalForm;

  @ApiProperty({ minLength: 2, maxLength: 200 })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'СТИР, 9 цифр; обязателен, кроме INDIVIDUAL (SPEC 8.1)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  regionId?: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  districtName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalAddress?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;
}

/** Тип организации не меняется (D-39). */
export class UpdateOrgDto extends PartialType(OmitType(CreateOrgDto, ['type'] as const)) {}

export class RegionRefDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() nameUz!: string;
  @ApiProperty() nameRu!: string;
}

export class OrgPrivateDto {
  @ApiProperty({ type: String, nullable: true }) tin!: string | null;
  @ApiProperty({ type: String, nullable: true }) districtName!: string | null;
  @ApiProperty({ type: String, nullable: true }) legalAddress!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Комментарий оператора к решению' })
  verificationNote!: string | null;
  @ApiProperty({
    enum: Object.values(MemberRole),
    enumName: 'MemberRole',
    nullable: true,
    description: 'Роль текущего пользователя',
  })
  myRole!: MemberRole | null;
}

export class OrgDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: Object.values(OrgType), enumName: 'OrgType' }) type!: OrgType;
  @ApiProperty({ enum: Object.values(LegalForm), enumName: 'LegalForm' }) legalForm!: LegalForm;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ type: RegionRefDto, nullable: true }) region!: RegionRefDto | null;
  @ApiProperty({ enum: Object.values(VerificationStatus), enumName: 'VerificationStatus' })
  verificationStatus!: VerificationStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) verifiedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, example: '4.75' }) ratingAvg!: string | null;
  @ApiProperty() ratingCount!: number;
  @ApiProperty({ type: String, nullable: true, example: '92.50' }) reliabilityScore!: string | null;
  @ApiProperty() completedOrders!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({
    type: OrgPrivateDto,
    description: 'Только для членов организации, оператора и администратора',
  })
  private?: OrgPrivateDto;
}

export class MemberDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, nullable: true }) fullName!: string | null;
  @ApiProperty() phone!: string;
  @ApiProperty({ enum: Object.values(MemberRole), enumName: 'MemberRole' }) role!: MemberRole;
  @ApiProperty({ type: String, format: 'date-time' }) joinedAt!: Date;
}

export class InvitationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() phone!: string;
  @ApiProperty({ enum: Object.values(MemberRole), enumName: 'MemberRole' }) role!: MemberRole;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}

export class MembersDto {
  @ApiProperty({ type: MemberDto, isArray: true }) members!: MemberDto[];
  @ApiProperty({
    type: InvitationDto,
    isArray: true,
    description: 'Ожидающие приглашения (видит OWNER)',
  })
  invitations!: InvitationDto[];
}

export class InviteMemberDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @MaxLength(32)
  phone!: string;

  @ApiProperty({ enum: Object.values(MemberRole), enumName: 'MemberRole' })
  @IsEnum(MemberRole)
  role!: MemberRole;
}

export class InviteResultDto {
  @ApiProperty({
    enum: ['ADDED', 'INVITED'],
    description: 'ADDED — пользователь уже был в системе',
  })
  result!: 'ADDED' | 'INVITED';
  @ApiPropertyOptional({ type: MemberDto }) member?: MemberDto;
  @ApiPropertyOptional({ type: InvitationDto }) invitation?: InvitationDto;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: Object.values(MemberRole), enumName: 'MemberRole' })
  @IsEnum(MemberRole)
  role!: MemberRole;
}
