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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import type { AuthContext } from '../../common/request-context.js';
import { OrgScoped } from '../auth/access.decorators.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import {
  ChangeRoleDto,
  CreateOrgDto,
  InviteMemberDto,
  InviteResultDto,
  MemberDto,
  MembersDto,
  OrgDto,
  UpdateOrgDto,
} from './orgs.dto.js';
import { OrgsService } from './orgs.service.js';

@ApiTags('orgs')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ApiErrorDto })
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post()
  @ApiCreatedResponse({ type: OrgDto, description: 'Создатель становится OWNER (SPEC 8.1)' })
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateOrgDto): Promise<OrgDto> {
    return this.orgs.create(auth, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: OrgDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string): Promise<OrgDto> {
    return this.orgs.get(auth, id);
  }

  @Patch(':id')
  @OrgScoped({ fromParam: 'id', allowPlatformStaff: true })
  @ApiOkResponse({ type: OrgDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Юридические поля заблокированы на проверке и после неё (D-30)',
  })
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() dto: UpdateOrgDto,
  ): Promise<OrgDto> {
    return this.orgs.update(auth, dto);
  }

  @Get(':id/members')
  @OrgScoped({ fromParam: 'id', allowPlatformStaff: true })
  @ApiOkResponse({ type: MembersDto })
  members(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
  ): Promise<MembersDto> {
    return this.orgs.members(auth);
  }

  @Post(':id/members')
  @OrgScoped({ fromParam: 'id', allowPlatformStaff: true })
  @ApiCreatedResponse({ type: InviteResultDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Уже участник' })
  invite(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() dto: InviteMemberDto,
  ): Promise<InviteResultDto> {
    return this.orgs.invite(auth, dto.phone, dto.role);
  }

  @Delete(':id/invitations/:invitationId')
  @HttpCode(204)
  @OrgScoped({ fromParam: 'id', allowPlatformStaff: true })
  @ApiNoContentResponse()
  async revokeInvitation(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.orgs.revokeInvitation(auth, invitationId);
  }

  @Patch(':id/members/:userId')
  @OrgScoped({ fromParam: 'id', allowPlatformStaff: true })
  @ApiOkResponse({ type: MemberDto })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Нельзя понизить последнего OWNER' })
  changeRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
  ): Promise<MemberDto> {
    return this.orgs.changeRole(auth, userId, dto.role);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  @OrgScoped({ fromParam: 'id', allowPlatformStaff: true })
  @ApiNoContentResponse()
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Нельзя исключить последнего OWNER' })
  async removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.orgs.removeMember(auth, userId);
  }
}
