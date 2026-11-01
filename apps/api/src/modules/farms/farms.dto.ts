import { WaterBodyType } from '@baliqbozor/domain';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { MediaDto } from '../media/media.dto.js';
import { RegionRefDto } from '../orgs/orgs.dto.js';

/** Координата строкой с точкой, до 6 знаков (Decimal(9,6), SPEC 7.1). */
const COORD = /^-?\d{1,3}(\.\d{1,6})?$/;
const AREA = /^\d{1,8}(\.\d{1,2})?$/;

export class CreateFarmDto {
  @ApiProperty({ example: 'Pond farm «Zarafshon»', maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  regionId!: number;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  districtName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string;

  @ApiProperty({ example: '39.654200', description: 'Точка на карте (в зоне сервиса)' })
  @IsString()
  @Matches(COORD)
  lat!: string;

  @ApiProperty({ example: '66.959700' })
  @IsString()
  @Matches(COORD)
  lng!: string;

  @ApiProperty({
    enum: Object.values(WaterBodyType),
    enumName: 'WaterBodyType',
    isArray: true,
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEnum(WaterBodyType, { each: true })
  waterBodyTypes!: WaterBodyType[];

  @ApiPropertyOptional({ example: '12.50', description: 'Площадь, га' })
  @IsOptional()
  @IsString()
  @Matches(AREA)
  areaHa?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    isArray: true,
    maxItems: 10,
    description: 'Фото хозяйства (назначение FARM_PHOTO) в порядке показа',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  mediaIds?: string[];
}

export class UpdateFarmDto extends PartialType(CreateFarmDto) {
  @ApiPropertyOptional({
    description: 'false — деактивация: активное наличие хозяйства уходит в PAUSED (SPEC 8.2)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class FarmDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) sellerOrgId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: RegionRefDto }) region!: RegionRefDto;
  @ApiProperty({ type: String, nullable: true }) districtName!: string | null;
  @ApiProperty({ type: String, nullable: true }) addressText!: string | null;
  @ApiProperty({ example: '39.654200' }) lat!: string;
  @ApiProperty({ example: '66.959700' }) lng!: string;
  @ApiProperty({ enum: Object.values(WaterBodyType), enumName: 'WaterBodyType', isArray: true })
  waterBodyTypes!: WaterBodyType[];
  @ApiProperty({ type: String, nullable: true }) areaHa!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: MediaDto, isArray: true }) photos!: MediaDto[];
  @ApiProperty({ description: 'Позиций наличия в статусе ACTIVE' }) activeListings!: number;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
