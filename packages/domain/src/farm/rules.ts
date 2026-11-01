import { type WaterBodyType } from '../enums.js';
import { DomainError, ErrorCode } from '../errors.js';
import { isInServiceArea } from '../geo/geo.js';

export interface FarmInput {
  name?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
  waterBodyTypes?: readonly WaterBodyType[] | undefined;
  areaHa?: number | null | undefined;
}

/**
 * Проверки хозяйства (SPEC 8.2): название, точка на карте в зоне сервиса, хотя бы один тип водоёма.
 * Для правки (`partial`) проверяются только переданные поля.
 */
export function assertValidFarm(input: FarmInput, partial = false): void {
  const fields: { field: string; constraints: string[] }[] = [];
  const need = (v: unknown) => !partial || v !== undefined;
  if (need(input.name) && (input.name ?? '').trim().length < 2) {
    fields.push({ field: 'name', constraints: ['minLength'] });
  }
  if (need(input.lat) || need(input.lng)) {
    if (input.lat === undefined || input.lng === undefined) {
      fields.push({ field: 'lat', constraints: ['pairRequired'] });
    } else if (!isInServiceArea({ lat: input.lat, lng: input.lng })) {
      fields.push({ field: 'lat', constraints: ['serviceArea'] });
    }
  }
  if (need(input.waterBodyTypes) && (input.waterBodyTypes ?? []).length === 0) {
    fields.push({ field: 'waterBodyTypes', constraints: ['arrayNotEmpty'] });
  }
  if (input.areaHa !== undefined && input.areaHa !== null && !(input.areaHa > 0)) {
    fields.push({ field: 'areaHa', constraints: ['positive'] });
  }
  if (fields.length > 0) {
    throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid farm', { fields });
  }
}
