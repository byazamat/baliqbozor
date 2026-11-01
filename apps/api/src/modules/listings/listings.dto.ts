import {
  ListingKind,
  ListingPauseReason,
  ListingStatus,
  PriceType,
  ProductForm,
} from '@baliqbozor/domain';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type as TransformType } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { CursorPageQueryDto, PageDto } from '../../common/pagination.js';
import { MediaDto } from '../media/media.dto.js';
import { RegionRefDto } from '../orgs/orgs.dto.js';

/** Вес строкой: до 3 знаков после точки (Decimal(12,3)). */
export const WEIGHT = /^\d{1,9}(\.\d{1,3})?$/;
/** Деньги строкой: целые сумы (BigInt). */
export const MONEY = /^\d{1,15}$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateListingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  farmId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  speciesId!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  sizeClassId!: number;

  @ApiProperty({ enum: Object.values(ProductForm), enumName: 'ProductForm' })
  @IsEnum(ProductForm)
  form!: ProductForm;

  @ApiProperty({ enum: Object.values(ListingKind), enumName: 'ListingKind' })
  @IsEnum(ListingKind)
  kind!: ListingKind;

  @ApiProperty({ example: '2000', description: 'Объём, кг' })
  @IsString()
  @Matches(WEIGHT)
  volumeKg!: string;

  @ApiPropertyOptional({
    example: '100',
    description: 'Минимальная партия, кг; по умолчанию — `order.minOrderKg`',
  })
  @IsOptional()
  @IsString()
  @Matches(WEIGHT)
  minOrderKg?: string;

  @ApiProperty({ enum: Object.values(PriceType), enumName: 'PriceType' })
  @IsEnum(PriceType)
  priceType!: PriceType;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '26000',
    description: 'Сум за кг; только для FIXED',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(MONEY)
  pricePerKg?: string | null;

  @ApiProperty({ example: '2026-11-05', description: 'Начало окна вылова' })
  @IsString()
  @Matches(DATE)
  availableFrom!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '2026-11-30' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(DATE)
  availableTo?: string | null;

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
    description: 'Фото и видео (назначение LISTING_MEDIA) в порядке показа',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  mediaIds?: string[];
}

export class UpdateListingDto extends PartialType(CreateListingDto) {}

export class ConfirmListingDto {
  @ApiPropertyOptional({ example: '1800', description: 'Новый объём, кг (OWNER/MANAGER, D-15)' })
  @IsOptional()
  @IsString()
  @Matches(WEIGHT)
  volumeKg?: string;

  @ApiPropertyOptional({ example: '25000', description: 'Новая цена (OWNER/MANAGER, D-15)' })
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  pricePerKg?: string;
}

export class SellerListingsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: Object.values(ListingStatus), enumName: 'ListingStatus' })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  farmId?: string;
}

export class SpeciesRefDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() nameUz!: string;
  @ApiProperty() nameRu!: string;
}

export class SizeClassRefDto {
  @ApiProperty() id!: number;
  @ApiProperty() code!: string;
  @ApiProperty() labelUz!: string;
  @ApiProperty() labelRu!: string;
}

export class FarmRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: RegionRefDto }) region!: RegionRefDto;
}

/** Общие поля наличия для продавца и каталога. */
export class ListingTermsDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: SpeciesRefDto }) species!: SpeciesRefDto;
  @ApiProperty({ type: SizeClassRefDto }) sizeClass!: SizeClassRefDto;
  @ApiProperty({ enum: Object.values(ProductForm), enumName: 'ProductForm' }) form!: ProductForm;
  @ApiProperty({ enum: Object.values(ListingKind), enumName: 'ListingKind' }) kind!: ListingKind;
  @ApiProperty({ example: '2000.000' }) availableKg!: string;
  @ApiProperty({ example: '100.000' }) minOrderKg!: string;
  @ApiProperty({ enum: Object.values(PriceType), enumName: 'PriceType' }) priceType!: PriceType;
  @ApiProperty({ type: String, nullable: true, example: '26000' }) pricePerKg!: string | null;
  @ApiProperty({ example: '2026-11-05' }) availableFrom!: string;
  @ApiProperty({ type: String, nullable: true }) availableTo!: string | null;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ description: 'Есть видео контрольного облова' }) hasVideo!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastConfirmedAt!: Date | null;
}

/** Наличие глазами продавца, оператора и администратора. */
export class ListingDto extends ListingTermsDto {
  @ApiProperty({ type: FarmRefDto }) farm!: FarmRefDto;
  @ApiProperty({ enum: Object.values(ListingStatus), enumName: 'ListingStatus' })
  status!: ListingStatus;
  @ApiProperty({
    enum: Object.values(ListingPauseReason),
    enumName: 'ListingPauseReason',
    nullable: true,
  })
  pauseReason!: ListingPauseReason | null;
  @ApiProperty({ example: '2000.000' }) volumeKg!: string;
  @ApiProperty({ example: '0.000' }) reservedKg!: string;
  @ApiProperty({ example: '0.000' }) soldKg!: string;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Срок подтверждения актуальности (только ACTIVE)',
  })
  freshnessDueAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ type: MediaDto, isArray: true }) media!: MediaDto[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class ListingPageDto extends PageDto(ListingDto) {}

export class PublicMediaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] }) kind!: 'IMAGE' | 'VIDEO';
  @ApiProperty({ description: 'Подписанная ссылка, 10 минут' }) url!: string;
  @ApiProperty({ type: String, nullable: true }) thumbUrl!: string | null;
  @ApiProperty({ type: Number, nullable: true }) width!: number | null;
  @ApiProperty({ type: Number, nullable: true }) height!: number | null;
  @ApiProperty({ type: Number, nullable: true }) durationSec!: number | null;
}

export class PublicSellerDto {
  @ApiProperty({ type: String, nullable: true, example: '4.80' }) ratingAvg!: string | null;
  @ApiProperty() ratingCount!: number;
  @ApiProperty({ type: String, nullable: true, example: '92.50' }) reliabilityScore!: string | null;
}

/**
 * Публичная карточка (SPEC 15 п. 13, D-53): без координат, адреса и названия хозяйства,
 * без названия и контактов продавца.
 */
export class PublicListingDto extends ListingTermsDto {
  @ApiProperty({ enum: ['ACTIVE', 'SOLD_OUT'] }) status!: 'ACTIVE' | 'SOLD_OUT';
  @ApiProperty({ type: RegionRefDto }) region!: RegionRefDto;
  @ApiProperty({ type: PublicSellerDto }) seller!: PublicSellerDto;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Расстояние от `near`, округлено вверх до 5 км',
  })
  distanceKm!: number | null;
  @ApiProperty({ type: PublicMediaDto, isArray: true, description: 'В списке — только обложка' })
  media!: PublicMediaDto[];
  @ApiProperty({ description: 'Сколько фото и видео у позиции' }) mediaCount!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: Date | null;
  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Ценовой индекс — M11 (пока null)',
  })
  priceIndex!: null;
}

export class PublicListingPageDto extends PageDto(PublicListingDto) {}

export const CATALOG_SORTS = ['score', 'price', 'distance', 'fresh'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export class CatalogQueryDto extends OmitType(CursorPageQueryDto, ['limit'] as const) {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  speciesId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  sizeClassId?: number;

  @ApiPropertyOptional({ enum: Object.values(ProductForm), enumName: 'ProductForm' })
  @IsOptional()
  @IsEnum(ProductForm)
  form?: ProductForm;

  @ApiPropertyOptional()
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  regionId?: number;

  @ApiPropertyOptional({ enum: Object.values(ListingKind), enumName: 'ListingKind' })
  @IsOptional()
  @IsEnum(ListingKind)
  kind?: ListingKind;

  @ApiPropertyOptional({ example: '2026-11-05', description: 'Рыба доступна в эту дату' })
  @IsOptional()
  @IsString()
  @Matches(DATE)
  availableOn?: string;

  @ApiPropertyOptional({ example: '27000', description: 'Цена за кг не выше; без «договорной»' })
  @IsOptional()
  @IsString()
  @Matches(MONEY)
  maxPrice?: string;

  @ApiPropertyOptional({ example: '41.2995,69.2401', description: 'Точка покупателя `lat,lng`' })
  @IsOptional()
  @IsString()
  @Matches(/^-?\d{1,2}(\.\d{1,8})?,-?\d{1,3}(\.\d{1,8})?$/)
  near?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2000,
    description: 'С `near`; по умолчанию `request.defaultRadiusKm`',
  })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  radiusKm?: number;

  @ApiPropertyOptional({ enum: CATALOG_SORTS, default: 'score' })
  @IsOptional()
  @IsIn(CATALOG_SORTS)
  sort?: CatalogSort;
}

export class PublicListingQueryDto {
  @ApiPropertyOptional({ example: '41.2995,69.2401' })
  @IsOptional()
  @IsString()
  @Matches(/^-?\d{1,2}(\.\d{1,8})?,-?\d{1,3}(\.\d{1,8})?$/)
  near?: string;
}
