import { DomainError, ErrorCode, normalizeUzPhone } from '@baliqbozor/domain';

/** Номер Узбекистана в `+998XXXXXXXXX` или `VALIDATION_FAILED` для поля `field` (D-32). */
export function requirePhone(input: string, field = 'phone'): string {
  const phone = normalizeUzPhone(input);
  if (!phone) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid phone', {
      fields: [{ field, constraints: ['isUzPhone'] }],
    });
  }
  return phone;
}

export function optionalPhone(
  input: string | null | undefined,
  field: string,
): string | null | undefined {
  if (input === undefined || input === null) return input;
  if (input.trim() === '') return null;
  return requirePhone(input, field);
}

export function fieldError(field: string, constraint: string): DomainError {
  return new DomainError(ErrorCode.VALIDATION_FAILED, 'Validation failed', {
    fields: [{ field, constraints: [constraint] }],
  });
}
