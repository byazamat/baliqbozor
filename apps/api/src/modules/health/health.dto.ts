import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status: 'ok';

  @ApiProperty({ example: 'api' })
  service: string;

  @ApiProperty({ example: 42 })
  uptimeSec: number;

  @ApiProperty({ format: 'date-time' })
  time: string;
}

export class ReadinessCheckDto {
  @ApiProperty({ enum: ['up', 'down'] })
  status: 'up' | 'down';

  @ApiProperty({ example: 3 })
  latencyMs: number;

  @ApiPropertyOptional({ example: 'timeout' })
  error?: string;
}

export class ReadinessChecksDto {
  @ApiProperty({ type: ReadinessCheckDto })
  database: ReadinessCheckDto;

  @ApiProperty({ type: ReadinessCheckDto })
  redis: ReadinessCheckDto;

  @ApiProperty({ type: ReadinessCheckDto })
  storage: ReadinessCheckDto;
}

export class ReadinessDto {
  @ApiProperty({ enum: ['ok', 'error'] })
  status: 'ok' | 'error';

  @ApiProperty({ type: ReadinessChecksDto })
  checks: ReadinessChecksDto;
}
