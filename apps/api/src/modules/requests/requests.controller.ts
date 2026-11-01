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
import { OrgScoped, PlatformRoles } from '../auth/access.decorators.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import {
  AdminRequestsQueryDto,
  CreateRequestDto,
  MyRequestsQueryDto,
  RequestDto,
  RequestPageDto,
  ReviewRequestDto,
  UpdateRequestDto,
} from './requests.dto.js';
import { RequestsService } from './requests.service.js';

const BUYER_SCOPE = { types: ['BUYER' as const], allowPlatformStaff: true };

/** Заявки покупателя (SPEC 10.3): своя организация по `X-Org-Id`; O/A — любой покупатель. */
@ApiTags('requests')
@ApiBearerAuth()
@ApiHeader({ name: 'X-Org-Id', required: true })
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('my')
  @OrgScoped(BUYER_SCOPE)
  @ApiOkResponse({ type: RequestPageDto })
  my(@CurrentAuth() auth: AuthContext, @Query() q: MyRequestsQueryDto): Promise<RequestPageDto> {
    return this.requests.listMine(auth, q);
  }

  @Get(':id')
  @OrgScoped(BUYER_SCOPE)
  @ApiOkResponse({ type: RequestDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDto> {
    return this.requests.getMine(auth, id);
  }

  @Post()
  @OrgScoped(BUYER_SCOPE)
  @ApiCreatedResponse({ type: RequestDto, description: 'Черновик (DRAFT)' })
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateRequestDto): Promise<RequestDto> {
    return this.requests.create(auth, dto);
  }

  @Patch(':id')
  @OrgScoped(BUYER_SCOPE)
  @ApiOkResponse({ type: RequestDto, description: 'Только DRAFT' })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
  ): Promise<RequestDto> {
    return this.requests.update(auth, id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @OrgScoped(BUYER_SCOPE)
  @ApiOkResponse({ type: RequestDto, description: '→ OPEN или PENDING_REVIEW (первая заявка)' })
  submit(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.submit(auth, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @OrgScoped(BUYER_SCOPE)
  @ApiOkResponse({ type: RequestDto })
  cancel(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.cancel(auth, id);
  }
}

/** Модерация первой заявки покупателя (SPEC 8.1 п. 6, D-58). */
@ApiTags('admin')
@ApiBearerAuth()
@PlatformRoles('OPERATOR', 'ADMIN')
@Controller('admin/requests')
export class AdminRequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOkResponse({ type: RequestPageDto, description: 'По умолчанию — PENDING_REVIEW' })
  list(
    @CurrentAuth() auth: AuthContext,
    @Query() q: AdminRequestsQueryDto,
  ): Promise<RequestPageDto> {
    return this.requests.listForReview(auth, q);
  }

  @Get(':id')
  @ApiOkResponse({ type: RequestDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RequestDto> {
    return this.requests.getForStaff(auth, id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOkResponse({ type: RequestDto })
  approve(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.review(auth, id, 'APPROVE');
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: RequestDto, description: 'Комментарий обязателен' })
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewRequestDto,
  ) {
    return this.requests.review(auth, id, 'REJECT', dto.note);
  }
}
