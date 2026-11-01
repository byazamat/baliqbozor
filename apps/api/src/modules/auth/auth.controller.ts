import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import { localeFromHeader } from '../../common/locale.js';
import type { AuthContext } from '../../common/request-context.js';
import {
  LoginResultDto,
  OtpRequestDto,
  OtpRequestResultDto,
  OtpVerifyDto,
  RefreshDto,
  TokenPairDto,
} from './auth.dto.js';
import { AuthService, type ClientInfo } from './auth.service.js';
import { CurrentAuth } from './current-auth.decorator.js';
import { Public } from './public.decorator.js';

const clientOf = (req: Request): ClientInfo => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  locale: localeFromHeader(req.headers['accept-language']),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  @ApiOkResponse({ type: OtpRequestResultDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'VALIDATION_FAILED' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'RATE_LIMITED (details.retryAfterSec)',
  })
  requestOtp(@Body() dto: OtpRequestDto, @Req() req: Request): Promise<OtpRequestResultDto> {
    return this.auth.requestOtp(dto.phone, clientOf(req));
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResultDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'OTP_INVALID, OTP_EXPIRED, VALIDATION_FAILED',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'OTP_TOO_MANY_ATTEMPTS' })
  verifyOtp(@Body() dto: OtpVerifyDto, @Req() req: Request): Promise<LoginResultDto> {
    return this.auth.verifyOtp(dto.phone, dto.code, clientOf(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<TokenPairDto> {
    return this.auth.refresh(dto.refreshToken, clientOf(req));
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  async logout(@CurrentAuth() auth: AuthContext): Promise<void> {
    await this.auth.logout(auth.sessionId);
  }
}
