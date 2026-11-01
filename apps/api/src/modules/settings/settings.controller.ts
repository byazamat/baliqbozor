import { DomainError, ErrorCode, isSettingKey, SETTING_KEYS, SETTINGS } from '@baliqbozor/domain';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiProperty,
  type ApiPropertyOptions,
  ApiTags,
} from '@nestjs/swagger';
import { IsDefined, IsString, MaxLength } from 'class-validator';

import { ApiErrorDto } from '../../common/api-error.dto.js';
import { PrismaService } from '../../infra/prisma.service.js';
import { PlatformRoles } from '../auth/access.decorators.js';
import { SettingsService } from './settings.service.js';

/** Значение настройки: число, строка, флаг или объект (SPEC 8.13). */
const jsonValue = (description: string): ApiPropertyOptions => ({
  description,
  oneOf: [
    { type: 'number' },
    { type: 'string' },
    { type: 'boolean' },
    { type: 'object', additionalProperties: true },
  ],
});

export class SettingDto {
  @ApiProperty({ example: 'commission.defaultRateBps' }) key!: string;
  @ApiProperty(jsonValue('Действующее значение')) value!: unknown;
  @ApiProperty(jsonValue('Значение по умолчанию (SPEC 8.13)'))
  defaultValue!: unknown;
  @ApiProperty({ description: 'Отличается от значения по умолчанию' }) changed!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) updatedAt!: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) updatedById!: string | null;
}

export class SettingsListDto {
  @ApiProperty({ type: SettingDto, isArray: true }) items!: SettingDto[];
}

export class UpdateSettingDto {
  @ApiProperty({ example: 'commission.defaultRateBps' })
  @IsString()
  @MaxLength(100)
  key!: string;

  @ApiProperty(jsonValue('Проверяется схемой настройки'))
  @IsDefined()
  value!: unknown;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Настройки платформы (SPEC 10.3 `/admin/settings`, 12.3): только администратор. */
@ApiTags('admin')
@ApiBearerAuth()
@PlatformRoles('ADMIN')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: SettingsListDto })
  async list(): Promise<SettingsListDto> {
    const [values, rows] = await Promise.all([
      this.settings.all(),
      this.prisma.client.setting.findMany({
        select: { key: true, updatedAt: true, updatedById: true },
      }),
    ]);
    const meta = new Map(rows.map((r) => [r.key, r]));
    return {
      items: SETTING_KEYS.map((key) => ({
        key,
        value: values[key],
        defaultValue: SETTINGS[key].default,
        changed: !same(values[key], SETTINGS[key].default),
        updatedAt: meta.get(key)?.updatedAt ?? null,
        updatedById: meta.get(key)?.updatedById ?? null,
      })),
    };
  }

  @Patch()
  @ApiOkResponse({ type: SettingDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'VALIDATION_FAILED: неизвестный ключ или значение не проходит схему',
  })
  async update(@Body() dto: UpdateSettingDto): Promise<SettingDto> {
    if (!isSettingKey(dto.key)) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Unknown setting', {
        fields: [{ field: 'key', constraints: ['isSettingKey'] }],
      });
    }
    await this.settings.update(dto.key, dto.value);
    const item = (await this.list()).items.find((i) => i.key === dto.key);
    if (!item) throw new DomainError(ErrorCode.NOT_FOUND, 'Setting not found');
    return item;
  }
}
