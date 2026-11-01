import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import type { AuthContext } from '../../common/request-context.js';
import { OrgScoped } from '../auth/access.decorators.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { CatalogService, parseNear } from './catalog.service.js';
import {
  CatalogQueryDto,
  ConfirmListingDto,
  CreateListingDto,
  ListingDto,
  ListingPageDto,
  PublicListingDto,
  PublicListingPageDto,
  PublicListingQueryDto,
  SellerListingsQueryDto,
  UpdateListingDto,
} from './listings.dto.js';
import { ListingsService } from './listings.service.js';

const SELLER_SCOPE = { types: ['SELLER' as const], allowPlatformStaff: true };

/** Публичный каталог (без входа, D-53). */
@ApiTags('listings')
@Controller('listings')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @Public()
  @ApiOkResponse({ type: PublicListingPageDto })
  search(@Query() query: CatalogQueryDto): Promise<PublicListingPageDto> {
    return this.catalog.search(query);
  }

  @Get(':id')
  @Public()
  @ApiOkResponse({ type: PublicListingDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  card(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PublicListingQueryDto,
  ): Promise<PublicListingDto> {
    return this.catalog.card(id, parseNear(query.near));
  }
}

/** Наличие продавца (SPEC 10.3): своя организация по `X-Org-Id`; O/A — любой продавец. */
@ApiTags('listings')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller()
export class SellerListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get('seller/listings')
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingPageDto })
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: SellerListingsQueryDto,
  ): Promise<ListingPageDto> {
    return this.listings.list(auth, query);
  }

  @Get('seller/listings/:id')
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ListingDto> {
    return this.listings.get(auth, id);
  }

  @Post('listings')
  @OrgScoped(SELLER_SCOPE)
  @ApiCreatedResponse({ type: ListingDto, description: 'Черновик (DRAFT)' })
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateListingDto): Promise<ListingDto> {
    return this.listings.create(auth, dto);
  }

  @Patch('listings/:id')
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingDto })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ): Promise<ListingDto> {
    return this.listings.update(auth, id, dto);
  }

  @Post('listings/:id/publish')
  @HttpCode(200)
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingDto, description: 'DRAFT/PAUSED/EXPIRED → ACTIVE' })
  publish(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.transition(auth, id, 'PUBLISH');
  }

  @Post('listings/:id/resume')
  @HttpCode(200)
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingDto, description: 'PAUSED → ACTIVE' })
  resume(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.transition(auth, id, 'RESUME');
  }

  @Post('listings/:id/pause')
  @HttpCode(200)
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingDto, description: 'ACTIVE → PAUSED' })
  pause(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.transition(auth, id, 'PAUSE');
  }

  @Post('listings/:id/archive')
  @HttpCode(200)
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingDto, description: 'Любой статус → ARCHIVED (без резервов)' })
  archive(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.transition(auth, id, 'ARCHIVE');
  }

  @Post('listings/:id/confirm')
  @HttpCode(200)
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: ListingDto, description: 'Подтверждение свежести (SPEC 8.3, D-15)' })
  confirm(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmListingDto,
  ): Promise<ListingDto> {
    return this.listings.confirm(auth, id, dto);
  }
}
