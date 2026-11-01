import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import type { AuthContext } from '../../common/request-context.js';
import { OrgScoped } from '../auth/access.decorators.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { CreateFarmDto, FarmDto, UpdateFarmDto } from './farms.dto.js';
import { FarmsService } from './farms.service.js';

/** Продавец своей организации; оператор и администратор — по `X-Org-Id` любой организации. */
const SELLER_SCOPE = { types: ['SELLER' as const], allowPlatformStaff: true };

@ApiTags('farms')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@ApiForbiddenResponse({ type: ApiErrorDto })
@Controller('farms')
export class FarmsController {
  constructor(private readonly farms: FarmsService) {}

  @Get()
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: FarmDto, isArray: true })
  list(@CurrentAuth() auth: AuthContext): Promise<FarmDto[]> {
    return this.farms.list(auth);
  }

  @Post()
  @OrgScoped(SELLER_SCOPE)
  @ApiCreatedResponse({ type: FarmDto })
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateFarmDto): Promise<FarmDto> {
    return this.farms.create(auth, dto);
  }

  @Get(':id')
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: FarmDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<FarmDto> {
    return this.farms.get(auth, id);
  }

  @Patch(':id')
  @OrgScoped(SELLER_SCOPE)
  @ApiOkResponse({ type: FarmDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFarmDto,
  ): Promise<FarmDto> {
    return this.farms.update(auth, id, dto);
  }
}
