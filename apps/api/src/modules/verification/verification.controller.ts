import { VerificationStatus } from '@baliqbozor/domain';
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
  ApiConflictResponse,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import { MediaDto } from '../media/media.dto.js';
import type { AuthContext } from '../../common/request-context.js';
import { OrgScoped, PlatformRoles } from '../auth/access.decorators.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import {
  AdminOrgDetailsDto,
  AdminOrgRowPageDto,
  AdminOrgsQueryDto,
  DecisionDto,
  OpsTaskDto,
  OpsTaskPageDto,
  RequiredNoteDto,
  SubmitVerificationDto,
  TasksQueryDto,
  UpdateTaskDto,
} from './verification.dto.js';
import { VerificationService } from './verification.service.js';

export class VerificationStatusDto {
  @ApiProperty({ enum: Object.values(VerificationStatus), enumName: 'VerificationStatus' })
  status!: VerificationStatus;
}

export class SubmitResultDto extends VerificationStatusDto {
  @ApiProperty({ format: 'uuid' }) taskId!: string;
}

@ApiTags('orgs')
@ApiBearerAuth()
@Controller('orgs')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post(':id/verification')
  @HttpCode(200)
  @OrgScoped({ fromParam: 'id' })
  @ApiOkResponse({
    type: SubmitResultDto,
    description: 'UNVERIFIED/REJECTED → PENDING, задача VERIFY_ORG (SPEC 8.1)',
  })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'INVALID_TRANSITION' })
  submit(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() dto: SubmitVerificationDto,
  ): Promise<SubmitResultDto> {
    return this.verification.submit(auth, dto.mediaIds, dto.note);
  }

  @Get(':id/documents')
  @OrgScoped({ fromParam: 'id', allowPlatformStaff: true })
  @ApiOkResponse({
    type: MediaDto,
    isArray: true,
    description: 'Загруженные документы верификации, новые первыми (D-46)',
  })
  documents(@Param('id', ParseUUIDPipe) id: string): Promise<MediaDto[]> {
    return this.verification.documents(id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@PlatformRoles('OPERATOR', 'ADMIN')
@Controller('admin')
export class AdminVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get('orgs')
  @ApiOkResponse({ type: AdminOrgRowPageDto })
  listOrgs(@Query() query: AdminOrgsQueryDto): Promise<AdminOrgRowPageDto> {
    return this.verification.listOrgs(query);
  }

  @Get('orgs/:id')
  @ApiOkResponse({ type: AdminOrgDetailsDto })
  orgDetails(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminOrgDetailsDto> {
    return this.verification.orgDetails(auth, id);
  }

  @Post('orgs/:id/verify')
  @HttpCode(200)
  @ApiOkResponse({ type: VerificationStatusDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'INVALID_TRANSITION' })
  verify(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ): Promise<VerificationStatusDto> {
    return this.verification.decide(auth, id, 'APPROVE', dto.note);
  }

  @Post('orgs/:id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: VerificationStatusDto })
  reject(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredNoteDto,
  ): Promise<VerificationStatusDto> {
    return this.verification.decide(auth, id, 'REJECT', dto.note);
  }

  @Post('orgs/:id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: VerificationStatusDto })
  suspend(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredNoteDto,
  ): Promise<VerificationStatusDto> {
    return this.verification.decide(auth, id, 'SUSPEND', dto.note);
  }

  @Post('orgs/:id/unsuspend')
  @HttpCode(200)
  @ApiOkResponse({ type: VerificationStatusDto })
  unsuspend(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
  ): Promise<VerificationStatusDto> {
    return this.verification.decide(auth, id, 'UNSUSPEND', dto.note);
  }

  @Get('tasks')
  @ApiOkResponse({ type: OpsTaskPageDto })
  tasks(@Query() query: TasksQueryDto): Promise<OpsTaskPageDto> {
    return this.verification.listTasks(query);
  }

  @Patch('tasks/:id')
  @ApiOkResponse({ type: OpsTaskDto })
  updateTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<OpsTaskDto> {
    return this.verification.updateTask(id, dto);
  }
}
