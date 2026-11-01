import { DomainError, ErrorCode } from '@baliqbozor/domain';
import { type Type } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type as TransformType } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `?limit=20&cursor=<opaque>` (SPEC 10.1). */
export class CursorPageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @ApiPropertyOptional({ description: 'Курсор из `nextCursor` предыдущей страницы' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

/** Позиция в списке, отсортированном по `createdAt DESC, id DESC`. */
export interface CursorKey {
  createdAt: Date;
  id: string;
}

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify([key.createdAt.toISOString(), key.id])).toString('base64url');
}

export function decodeCursor(cursor: string): CursorKey {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [iso, id] = parsed as unknown[];
      const createdAt = new Date(String(iso));
      if (typeof iso === 'string' && typeof id === 'string' && !Number.isNaN(createdAt.getTime())) {
        return { createdAt, id };
      }
    }
  } catch {
    // ниже — единая ошибка
  }
  throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid cursor', {
    fields: [{ field: 'cursor', constraints: ['invalidCursor'] }],
  });
}

/** Условие Prisma «после курсора» для сортировки `createdAt DESC, id DESC`. */
export function afterCursor(cursor: string | undefined) {
  if (!cursor) return {};
  const { createdAt, id } = decodeCursor(cursor);
  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

export const PAGE_ORDER = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** `rows` запрошены с `take: limit + 1`: лишняя строка означает, что есть следующая страница. */
export function toPage<T extends CursorKey>(rows: T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}

const pageClasses = new Map<Type, Type>();

/** DTO страницы для OpenAPI: `{ items: T[], nextCursor: string | null }`. */
export function PageDto<T>(item: Type<T>): Type<Page<T>> {
  const cached = pageClasses.get(item);
  if (cached) return cached as Type<Page<T>>;
  class PageOf {
    @ApiProperty({ type: item, isArray: true })
    items!: T[];

    @ApiProperty({ type: String, nullable: true })
    nextCursor!: string | null;
  }
  Object.defineProperty(PageOf, 'name', { value: `${item.name}Page` });
  pageClasses.set(item, PageOf);
  return PageOf;
}
