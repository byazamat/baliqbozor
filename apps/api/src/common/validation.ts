import { DomainError, ErrorCode } from '@baliqbozor/domain';
import { ValidationPipe, type ValidationError } from '@nestjs/common';

export interface FieldError {
  field: string;
  constraints: string[];
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, constraints: Object.keys(e.constraints) }] : [];
    return [...own, ...flattenValidationErrors(e.children ?? [], field)];
  });
}

/** DTO + class-validator; ошибки → `VALIDATION_FAILED` с перечнем полей (SPEC 10.2, 13.2). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new DomainError(ErrorCode.VALIDATION_FAILED, 'Validation failed', {
        fields: flattenValidationErrors(errors),
      }),
  });
}
