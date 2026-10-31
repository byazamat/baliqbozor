import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { HealthDto, ReadinessDto } from './health.dto.js';
import { HealthService } from './health.service.js';

/** `/health` и `/ready` — вне префикса `/api/v1` (DECISIONS D-05). */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('health')
  @HttpCode(200)
  @ApiOkResponse({ type: HealthDto, description: 'Процесс жив' })
  getHealth(): HealthDto {
    return this.health.liveness();
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadinessDto, description: 'БД, Redis и S3 доступны' })
  @ApiServiceUnavailableResponse({
    type: ReadinessDto,
    description: 'Одна из зависимостей недоступна',
  })
  async getReady(@Res({ passthrough: true }) res: Response): Promise<ReadinessDto> {
    const result = await this.health.readiness();
    res.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
