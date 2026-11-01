import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Эндпоинт доступен без входа (SPEC 10.3: public). По умолчанию всё закрыто. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
