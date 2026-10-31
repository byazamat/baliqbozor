import { ERROR_CODES, type ErrorCode } from '@baliqbozor/domain';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorBodyDto {
  @ApiProperty({ enum: ERROR_CODES, enumName: 'ErrorCode' })
  code: ErrorCode;

  @ApiProperty({ example: 'Недостаточно доступного объёма' })
  message: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;

  @ApiProperty({ example: 'b7c1f0e2-…' })
  requestId: string;
}

/** Формат ошибки SPEC 10.2 для OpenAPI. */
export class ApiErrorDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error: ApiErrorBodyDto;
}
