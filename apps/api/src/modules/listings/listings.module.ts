import { Module } from '@nestjs/common';

import { CatalogService } from './catalog.service.js';
import { CatalogController, SellerListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  controllers: [CatalogController, SellerListingsController],
  providers: [ListingsService, CatalogService],
})
export class ListingsModule {}
