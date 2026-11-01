import { ProductForm, RequestStatus } from '@baliqbozor/domain';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { CursorPageQueryDto, PageDto } from '../../common/pagination.js';
import { DATE, MONEY, SizeClassRefDto, SpeciesRefDto, WEIGHT } from '../listings/listings.dto.js';
import { RegionRefDto } from '../orgs/orgs.dto.js';

export class CreateRequestDto {
  @ApiProperty() @IsInt() @Min(1) speciesId!: number;
  @ApiProperty() @IsInt() @Min(1) sizeClassId!: number;

  @ApiPropertyOptional({ description: 'Готов на соседний размерный класс' })
  @IsOptional()
  @IsBoolean()
  acceptAdjacentSizes?: boolean;

  @ApiProperty({ enum: Object.values(ProductForm), enumName: 'ProductForm' })
  @IsEnum(ProductForm)
  form!: ProductForm;

  @ApiProperty({ example: '2500' }) @IsString() @Matches(WEIGHT) volumeKg!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '1000',
    description: 'Минимальный приемлемый объём; по умолчанию — весь объём',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(WEIGHT)
  minAcceptableKg?: string | null;

  @ApiProperty({ format: 'uuid', description: 'Адрес доставки организации' })
  @IsUUID()
  deliveryAddressId!: string;

  @ApiProperty({ example: '2026-11-05' }) @IsString() @Matches(DATE) deliveryDateFrom!: string;
  @ApiProperty({ example: '2026-11-06' }) @IsString() @Matches(DATE) deliveryDateTo!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '26000' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @Matches(MONEY)
  targetPricePerKg?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2000,
    description: 'По умолчанию `request.defaultRadiusKm`',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  radiusKm?: number;

  @ApiPropertyOptional({ description: '«Нужно регулярно» (информативно в MVP)' })
  @IsOptional()
  @IsBoolean()
  isRecurringInterest?: boolean;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateRequestDto extends PartialType(CreateRequestDto) {}

export class MyRequestsQueryDto extends CursorPageQueryDto {
  @ApiPropertyOptional({ enum: Object.values(RequestStatus), enumName: 'RequestStatus' })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
}

export class AdminRequestsQueryDto extends MyRequestsQueryDto {}

export class ReviewRequestDto {
  @ApiPropertyOptional({ maxLength: 1000, description: 'Обязателен при отказе' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note?: string;
}

export class RequestAddressDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() addressText!: string;
  @ApiProperty({ type: RegionRefDto }) region!: RegionRefDto;
  @ApiProperty({ example: '41.285300' }) lat!: string;
  @ApiProperty({ example: '69.203400' }) lng!: string;
}

/** Заявка глазами покупателя, оператора и администратора. */
export class RequestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'RQ-2026-000123' }) number!: string;
  @ApiProperty({ format: 'uuid' }) buyerOrgId!: string;
  @ApiProperty() buyerName!: string;
  @ApiProperty({ enum: Object.values(RequestStatus), enumName: 'RequestStatus' })
  status!: RequestStatus;
  @ApiProperty({ type: SpeciesRefDto }) species!: SpeciesRefDto;
  @ApiProperty({ type: SizeClassRefDto }) sizeClass!: SizeClassRefDto;
  @ApiProperty() acceptAdjacentSizes!: boolean;
  @ApiProperty({ enum: Object.values(ProductForm), enumName: 'ProductForm' }) form!: ProductForm;
  @ApiProperty({ example: '2500.000' }) volumeKg!: string;
  @ApiProperty({ type: String, nullable: true }) minAcceptableKg!: string | null;
  @ApiProperty({ example: '2500.000', description: 'Остаток: объём минус активные строки заказов' })
  volumeRemaining!: string;
  @ApiProperty({ type: RequestAddressDto }) deliveryAddress!: RequestAddressDto;
  @ApiProperty({ example: '2026-11-05' }) deliveryDateFrom!: string;
  @ApiProperty({ example: '2026-11-06' }) deliveryDateTo!: string;
  @ApiProperty({ type: String, nullable: true }) targetPricePerKg!: string | null;
  @ApiProperty() radiusKm!: number;
  @ApiProperty() isRecurringInterest!: boolean;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Причина отказа модерации' })
  reviewNote!: string | null;
  @ApiProperty({ description: 'Предложений в статусе PENDING' }) pendingOffers!: number;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) submittedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) openedAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}

export class RequestPageDto extends PageDto(RequestDto) {}

export class CandidateDto {
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty({ type: String, nullable: true, description: 'Только O/A' }) sellerOrgId!:
    string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Только O/A' }) sellerName!:
    string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Только O/A' }) farmName!:
    string | null;
  @ApiProperty({ type: RegionRefDto }) region!: RegionRefDto;
  @ApiProperty({ description: 'Покупателю — вверх до 5 км (D-53)' }) distanceKm!: number;
  @ApiProperty({ example: 0.82 }) score!: number;
  @ApiProperty({ example: '2000.000' }) availableKg!: string;
  @ApiProperty({ type: String, nullable: true, description: 'null — договорная' })
  pricePerKg!: string | null;
}

export class SplitLineDto {
  @ApiProperty({ format: 'uuid' }) listingId!: string;
  @ApiProperty({ example: '1500.000' }) volumeKg!: string;
}

export class SuggestedSplitDto {
  @ApiProperty({ type: SplitLineDto, isArray: true }) lines!: SplitLineDto[];
  @ApiProperty({ example: '2500.000' }) coveredKg!: string;
  @ApiProperty({ description: 'Остаток закрыт полностью' }) complete!: boolean;
}

export class CandidatesDto {
  @ApiProperty({ type: CandidateDto, isArray: true }) items!: CandidateDto[];
  @ApiProperty({ type: SuggestedSplitDto }) suggestedSplit!: SuggestedSplitDto;
}

export class InviteSellerDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() sellerOrgId!: string;
}
