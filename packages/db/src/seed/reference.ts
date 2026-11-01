import { defaultSettings, SETTING_KEYS } from '@baliqbozor/domain';

import type { PrismaClient } from '../generated/prisma/client.js';

/** Регионы SPEC 7.3 в порядке показа. */
export const REGIONS: readonly { code: string; nameRu: string; nameUz: string }[] = [
  { code: 'TASHKENT_CITY', nameRu: 'г. Ташкент', nameUz: 'Toshkent shahri' },
  { code: 'TASHKENT', nameRu: 'Ташкентская область', nameUz: 'Toshkent viloyati' },
  { code: 'ANDIJAN', nameRu: 'Андижанская область', nameUz: 'Andijon viloyati' },
  { code: 'BUKHARA', nameRu: 'Бухарская область', nameUz: 'Buxoro viloyati' },
  { code: 'JIZZAKH', nameRu: 'Джизакская область', nameUz: 'Jizzax viloyati' },
  { code: 'KASHKADARYA', nameRu: 'Кашкадарьинская область', nameUz: 'Qashqadaryo viloyati' },
  { code: 'NAVOI', nameRu: 'Навоийская область', nameUz: 'Navoiy viloyati' },
  { code: 'NAMANGAN', nameRu: 'Наманганская область', nameUz: 'Namangan viloyati' },
  { code: 'SAMARKAND', nameRu: 'Самаркандская область', nameUz: 'Samarqand viloyati' },
  { code: 'SURKHANDARYA', nameRu: 'Сурхандарьинская область', nameUz: 'Surxondaryo viloyati' },
  { code: 'SYRDARYA', nameRu: 'Сырдарьинская область', nameUz: 'Sirdaryo viloyati' },
  { code: 'FERGANA', nameRu: 'Ферганская область', nameUz: "Farg'ona viloyati" },
  { code: 'KHOREZM', nameRu: 'Хорезмская область', nameUz: 'Xorazm viloyati' },
  {
    code: 'KARAKALPAKSTAN',
    nameRu: 'Республика Каракалпакстан',
    nameUz: "Qoraqalpog'iston Respublikasi",
  },
];

interface SizeClassSeed {
  code: string;
  minKg: string;
  maxKg: string | null;
}

const CYPRINID: readonly SizeClassSeed[] = [
  { code: '0-0.5', minKg: '0', maxKg: '0.5' },
  { code: '0.5-1', minKg: '0.5', maxKg: '1' },
  { code: '1-2', minKg: '1', maxKg: '2' },
  { code: '2-3', minKg: '2', maxKg: '3' },
  { code: '3+', minKg: '3', maxKg: null },
];
const TROUT: readonly SizeClassSeed[] = [
  { code: '0.25-0.4', minKg: '0.25', maxKg: '0.4' },
  { code: '0.4-0.7', minKg: '0.4', maxKg: '0.7' },
  { code: '0.7+', minKg: '0.7', maxKg: null },
];
const STURGEON: readonly SizeClassSeed[] = [
  { code: '1-3', minKg: '1', maxKg: '3' },
  { code: '3-5', minKg: '3', maxKg: '5' },
  { code: '5+', minKg: '5', maxKg: null },
];
const WARM_WATER: readonly SizeClassSeed[] = [
  { code: '0.3-0.6', minKg: '0.3', maxKg: '0.6' },
  { code: '0.6-1', minKg: '0.6', maxKg: '1' },
  { code: '1+', minKg: '1', maxKg: null },
];

/** Виды рыбы SPEC 7.3 (узбекские названия — проверить с носителем языка до запуска). */
export const SPECIES: readonly {
  code: string;
  nameRu: string;
  nameUz: string;
  nameLatin: string | null;
  sizes: readonly SizeClassSeed[];
}[] = [
  {
    code: 'CARP',
    nameRu: 'Карп (сазан)',
    nameUz: "Zog'ora baliq (karp)",
    nameLatin: 'Cyprinus carpio',
    sizes: CYPRINID,
  },
  {
    code: 'SILVER_CARP',
    nameRu: 'Толстолобик белый',
    nameUz: "Oq do'ngpeshona",
    nameLatin: 'Hypophthalmichthys molitrix',
    sizes: CYPRINID,
  },
  {
    code: 'BIGHEAD_CARP',
    nameRu: 'Толстолобик пёстрый',
    nameUz: "Ola do'ngpeshona",
    nameLatin: 'Hypophthalmichthys nobilis',
    sizes: CYPRINID,
  },
  {
    code: 'GRASS_CARP',
    nameRu: 'Белый амур',
    nameUz: 'Oq amur',
    nameLatin: 'Ctenopharyngodon idella',
    sizes: CYPRINID,
  },
  {
    code: 'RAINBOW_TROUT',
    nameRu: 'Форель радужная',
    nameUz: 'Gulmoy (forel)',
    nameLatin: 'Oncorhynchus mykiss',
    sizes: TROUT,
  },
  {
    code: 'STURGEON',
    nameRu: 'Осётр',
    nameUz: 'Bekire (osetr)',
    nameLatin: 'Acipenser spp.',
    sizes: STURGEON,
  },
  {
    code: 'AFRICAN_CATFISH',
    nameRu: 'Клариевый сом',
    nameUz: 'Klarias laqqa baliq',
    nameLatin: 'Clarias gariepinus',
    sizes: WARM_WATER,
  },
  {
    code: 'TILAPIA',
    nameRu: 'Тиляпия',
    nameUz: 'Tilapiya',
    nameLatin: 'Oreochromis spp.',
    sizes: WARM_WATER,
  },
  { code: 'OTHER', nameRu: 'Другое', nameUz: 'Boshqa', nameLatin: null, sizes: [] },
];

const comma = (kg: string) => kg.replace('.', ',');

/** Подписи размерного класса: `1–2 кг`, `до 0,5 кг`, `от 3 кг` (SPEC 12.1: запятая). */
export function sizeLabels(s: SizeClassSeed): { labelRu: string; labelUz: string } {
  if (s.maxKg === null)
    return { labelRu: `от ${comma(s.minKg)} кг`, labelUz: `${comma(s.minKg)} kg dan ortiq` };
  if (Number(s.minKg) === 0)
    return { labelRu: `до ${comma(s.maxKg)} кг`, labelUz: `${comma(s.maxKg)} kg gacha` };
  const range = `${comma(s.minKg)}–${comma(s.maxKg)}`;
  return { labelRu: `${range} кг`, labelUz: `${range} kg` };
}

export interface ReferenceSeedResult {
  regions: number;
  species: number;
  sizeClasses: number;
  settingsCreated: number;
}

/**
 * Справочники SPEC 7.3 и настройки 8.13. Идемпотентно: справочники приводятся к эталону
 * (upsert по `code`), настройки только добавляются — значения, изменённые администратором,
 * не перезаписываются.
 */
export async function seedReference(prisma: PrismaClient): Promise<ReferenceSeedResult> {
  let sizeClasses = 0;
  await prisma.$transaction(async (tx) => {
    for (const [sort, r] of REGIONS.entries()) {
      await tx.region.upsert({
        where: { code: r.code },
        create: { ...r, sort },
        update: { nameRu: r.nameRu, nameUz: r.nameUz, sort },
      });
    }
    for (const [sort, s] of SPECIES.entries()) {
      const { sizes, ...species } = s;
      const row = await tx.fishSpecies.upsert({
        where: { code: s.code },
        create: { ...species, sort },
        update: { nameRu: s.nameRu, nameUz: s.nameUz, nameLatin: s.nameLatin, sort },
      });
      for (const [sizeSort, size] of sizes.entries()) {
        const data = { ...size, ...sizeLabels(size), sort: sizeSort };
        await tx.sizeClass.upsert({
          where: { speciesId_code: { speciesId: row.id, code: size.code } },
          create: { ...data, speciesId: row.id },
          update: data,
        });
        sizeClasses += 1;
      }
    }
  });
  const defaults = defaultSettings();
  const created = await prisma.setting.createMany({
    data: SETTING_KEYS.map((key) => ({ key, value: defaults[key] as never })),
    skipDuplicates: true,
  });
  return {
    regions: REGIONS.length,
    species: SPECIES.length,
    sizeClasses,
    settingsCreated: created.count,
  };
}
