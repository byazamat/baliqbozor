import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../../infra/prisma.service.js';
import { Public } from '../auth/public.decorator.js';
import { RegionRefDto } from '../orgs/orgs.dto.js';

export class SizeClassDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: '1-2' }) code!: string;
  @ApiProperty({ example: '1.000' }) minKg!: string;
  @ApiProperty({ type: String, nullable: true, example: '2.000', description: 'null — «и больше»' })
  maxKg!: string | null;
  @ApiProperty() labelUz!: string;
  @ApiProperty() labelRu!: string;
}

export class SpeciesDto {
  @ApiProperty() id!: number;
  @ApiProperty({ example: 'SILVER_CARP' }) code!: string;
  @ApiProperty() nameUz!: string;
  @ApiProperty() nameRu!: string;
  @ApiProperty({ type: String, nullable: true }) nameLatin!: string | null;
  @ApiProperty({ type: SizeClassDto, isArray: true }) sizeClasses!: SizeClassDto[];
}

/** Справочники (SPEC 10.3): публичные, только активные записи, в порядке `sort`. */
@ApiTags('dict')
@Public()
@Controller('dict')
export class DictController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('regions')
  @ApiOkResponse({ type: RegionRefDto, isArray: true })
  regions(): Promise<RegionRefDto[]> {
    return this.prisma.client.region.findMany({
      select: { id: true, code: true, nameUz: true, nameRu: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
  }

  @Get('species')
  @ApiOkResponse({ type: SpeciesDto, isArray: true })
  async species(): Promise<SpeciesDto[]> {
    const rows = await this.prisma.client.fishSpecies.findMany({
      where: { isActive: true },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      include: {
        sizeClasses: { where: { isActive: true }, orderBy: [{ sort: 'asc' }, { id: 'asc' }] },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      code: s.code,
      nameUz: s.nameUz,
      nameRu: s.nameRu,
      nameLatin: s.nameLatin,
      sizeClasses: s.sizeClasses.map((c) => ({
        id: c.id,
        code: c.code,
        minKg: c.minKg.toFixed(3),
        maxKg: c.maxKg?.toFixed(3) ?? null,
        labelUz: c.labelUz,
        labelRu: c.labelRu,
      })),
    }));
  }
}
