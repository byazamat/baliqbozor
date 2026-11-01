import { Module } from '@nestjs/common';

import { DictController } from './dict.controller.js';

@Module({ controllers: [DictController] })
export class DictModule {}
