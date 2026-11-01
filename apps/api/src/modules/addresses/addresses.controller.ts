import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthContext } from '../../common/request-context.js';
import { OrgScoped } from '../auth/access.decorators.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { AddressDto, CreateAddressDto, UpdateAddressDto } from './addresses.dto.js';
import { AddressesService } from './addresses.service.js';

const BUYER_SCOPE = { types: ['BUYER' as const], allowPlatformStaff: true };

@ApiTags('addresses')
@ApiBearerAuth()
@Controller()
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get('orgs/:id/addresses')
  @OrgScoped({ ...BUYER_SCOPE, fromParam: 'id' })
  @ApiOkResponse({ type: AddressDto, isArray: true })
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
  ): Promise<AddressDto[]> {
    return this.addresses.list(auth);
  }

  @Post('orgs/:id/addresses')
  @OrgScoped({ ...BUYER_SCOPE, fromParam: 'id' })
  @ApiCreatedResponse({ type: AddressDto })
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressDto> {
    return this.addresses.create(auth, dto);
  }

  @Patch('addresses/:addressId')
  @OrgScoped(BUYER_SCOPE)
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @ApiOkResponse({ type: AddressDto })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('addressId', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    return this.addresses.update(auth, addressId, dto);
  }

  @Delete('addresses/:addressId')
  @HttpCode(204)
  @OrgScoped(BUYER_SCOPE)
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @ApiNoContentResponse({ description: 'Архивирование' })
  async archive(
    @CurrentAuth() auth: AuthContext,
    @Param('addressId', ParseUUIDPipe) addressId: string,
  ): Promise<void> {
    await this.addresses.archive(auth, addressId);
  }
}
