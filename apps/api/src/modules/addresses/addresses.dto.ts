import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { RegionRefDto } from '../orgs/orgs.dto.js';

/** Координата строкой с точкой, до 6 знаков (Decimal(9,6), SPEC 7.1). */
const COORD = /^-?\d{1,3}(\.\d{1,6})?$/;

export class CreateAddressDto {
  @ApiProperty({ example: 'Ресторан на Чиланзаре', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  addressText!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  regionId!: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  districtName?: string;

  @ApiProperty({ example: '41.285300' })
  @IsString()
  @Matches(COORD)
  lat!: string;

  @ApiProperty({ example: '69.203400' })
  @IsString()
  @Matches(COORD)
  lng!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ example: '08:00–11:00 приёмка', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  workingHours?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class AddressDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() addressText!: string;
  @ApiProperty({ type: RegionRefDto }) region!: RegionRefDto;
  @ApiProperty({ type: String, nullable: true }) districtName!: string | null;
  @ApiProperty({ example: '41.2853' }) lat!: string;
  @ApiProperty({ example: '69.2034' }) lng!: string;
  @ApiProperty({ type: String, nullable: true }) contactName!: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone!: string | null;
  @ApiProperty({ type: String, nullable: true }) workingHours!: string | null;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
