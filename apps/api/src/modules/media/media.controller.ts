import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import type { AuthContext } from '../../common/request-context.js';
import { OrgScoped } from '../auth/access.decorators.js';
import { CurrentAuth } from '../auth/current-auth.decorator.js';
import { DownloadUrlDto, MediaDto, UploadUrlDto, UploadUrlRequestDto } from './media.dto.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload-url')
  @OrgScoped()
  @ApiHeader({ name: 'X-Org-Id', required: true })
  @ApiCreatedResponse({ type: UploadUrlDto })
  @ApiPayloadTooLargeResponse({ type: ApiErrorDto, description: 'MEDIA_TOO_LARGE' })
  @ApiUnsupportedMediaTypeResponse({ type: ApiErrorDto, description: 'MEDIA_TYPE_NOT_ALLOWED' })
  requestUpload(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UploadUrlRequestDto,
  ): Promise<UploadUrlDto> {
    return this.media.requestUpload(auth, dto);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOkResponse({ type: MediaDto })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Файл не загружен или размер не совпадает',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  complete(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MediaDto> {
    return this.media.complete(auth, id);
  }

  @Get(':id/url')
  @ApiOkResponse({ type: DownloadUrlDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  downloadUrl(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DownloadUrlDto> {
    return this.media.downloadUrl(auth, id);
  }
}
